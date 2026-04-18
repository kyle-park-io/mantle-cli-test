#!/usr/bin/env bash
# Aave V3에 WETH 0.004를 공급합니다.
#
# 배경: Mantle Aave V3에서 담보(LTV > 0)로 쓸 수 있는 자산은 WETH(LTV 80.5%)뿐입니다.
#       USDC는 LTV=0이라 담보 불가. WETH는 isolation mode로 공급되며,
#       isolation mode에서 borrow 가능한 자산: USDC, USDe, USDT0, GHO
# 사전 조건: agni-swap-usdc-weth/swap.sh 로 WETH 확보
# 순서: 1) approve WETH → Aave Pool → 2) supply

set -euo pipefail

WALLET="0x5cf08f46628b6d8ae56b1cdd5197fd12172de47e"
AMOUNT="0.004"
AAVE_POOL="0x458F293454fE0d67EC0655f3672301301DD51422"
CAIP2="eip155:5000"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
AGENT_TOKEN="$ROOT_DIR/skills/agent-token/scripts/agent-token.ts"
APPROVE_FILE="$SCRIPT_DIR/approve.json"
SUPPLY_FILE="$SCRIPT_DIR/supply.json"

# ---------------------------------------------------------------------------
# 공통: nonce / gas price 조회
# ---------------------------------------------------------------------------

NONCE_HEX=$(curl -s -X POST https://rpc.mantle.xyz \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getTransactionCount\",\"params\":[\"$WALLET\",\"pending\"],\"id\":1}" \
  | jq -r '.result')
NONCE=$(( NONCE_HEX ))
echo "nonce: $NONCE_HEX → $NONCE"

GAS_PRICE_WEI=$(yarn --cwd "$ROOT_DIR" mantle-cli chain status --json 2>/dev/null | jq -r '.gas_price_wei')
GAS_PRICE_HEX=$(printf '0x%x' $(( GAS_PRICE_WEI * 12 / 10 )))
echo "gas_price: $GAS_PRICE_WEI wei → $GAS_PRICE_HEX (1.2x)"

# ---------------------------------------------------------------------------
# Step 1: approve WETH → Aave Pool (nonce N)
# ---------------------------------------------------------------------------

echo ""
echo "[1/2] approve WETH → Aave Pool 중... (nonce=$NONCE)"

yarn --cwd "$ROOT_DIR" mantle-cli swap approve \
  --token WETH --spender "$AAVE_POOL" --amount "$AMOUNT" --owner "$WALLET" \
  --json > "$APPROVE_FILE"

APPROVE_DATA=$(jq -r '.unsigned_tx.data' "$APPROVE_FILE")

if [[ "$APPROVE_DATA" == "0x" ]]; then
  echo "approve 불필요 (allowance 충분) — 건너뜀"
else
  APPROVE_GAS_LIMIT=$(yarn --cwd "$ROOT_DIR" mantle-cli chain estimate-gas \
    --to "$(jq -r '.unsigned_tx.to' "$APPROVE_FILE")" \
    --from "$WALLET" \
    --data "$APPROVE_DATA" \
    --value "$(jq -r '.unsigned_tx.value' "$APPROVE_FILE")" \
    --json 2>/dev/null | jq -r '.gas_limit')
  echo "approve gas_limit: $APPROVE_GAS_LIMIT"

  APPROVE_TX=$(jq --argjson nonce "$NONCE" --arg gas_price "$GAS_PRICE_HEX" --argjson gas_limit "$APPROVE_GAS_LIMIT" \
    '.unsigned_tx | {to, data, value, chain_id: .chainId, nonce: $nonce, gas: $gas_limit, max_fee_per_gas: $gas_price, max_priority_fee_per_gas: $gas_price}' \
    "$APPROVE_FILE")

  bun "$AGENT_TOKEN" sign evm-transaction \
    --caip2 "$CAIP2" \
    --transaction "$APPROVE_TX" \
    --broadcast

  NONCE=$(( NONCE + 1 ))
fi

# ---------------------------------------------------------------------------
# Step 2: supply WETH (nonce N 또는 N+1)
# ---------------------------------------------------------------------------

echo ""
echo "[2/2] supply 트랜잭션 생성 및 브로드캐스트 중... (nonce=$NONCE)"

yarn --cwd "$ROOT_DIR" mantle-cli aave supply \
  --asset WETH \
  --amount "$AMOUNT" \
  --on-behalf-of "$WALLET" \
  --json > "$SUPPLY_FILE"

SUPPLY_GAS_LIMIT=$(yarn --cwd "$ROOT_DIR" mantle-cli chain estimate-gas \
  --to "$(jq -r '.unsigned_tx.to' "$SUPPLY_FILE")" \
  --from "$WALLET" \
  --data "$(jq -r '.unsigned_tx.data' "$SUPPLY_FILE")" \
  --value "$(jq -r '.unsigned_tx.value' "$SUPPLY_FILE")" \
  --json 2>/dev/null | jq -r '.gas_limit')
echo "supply gas_limit: $SUPPLY_GAS_LIMIT"

SUPPLY_TX=$(jq --argjson nonce "$NONCE" --arg gas_price "$GAS_PRICE_HEX" --argjson gas_limit "$SUPPLY_GAS_LIMIT" \
  '.unsigned_tx | {to, data, value, chain_id: .chainId, nonce: $nonce, gas: $gas_limit, max_fee_per_gas: $gas_price, max_priority_fee_per_gas: $gas_price}' \
  "$SUPPLY_FILE")

bun "$AGENT_TOKEN" sign evm-transaction \
  --caip2 "$CAIP2" \
  --transaction "$SUPPLY_TX" \
  --broadcast

# ---------------------------------------------------------------------------
# Step 3: set-collateral 활성화 (nonce N+1 또는 N+2)
# ---------------------------------------------------------------------------

echo ""
echo "[3/3] set-collateral WETH 활성화 중... (nonce=$((NONCE + 1)))"

COLLATERAL_FILE="$SCRIPT_DIR/set-collateral.json"
COLLATERAL_NONCE=$(( NONCE + 1 ))

yarn --cwd "$ROOT_DIR" mantle-cli aave set-collateral \
  --asset WETH --user "$WALLET" \
  --json > "$COLLATERAL_FILE"

COLLATERAL_GAS_LIMIT=$(yarn --cwd "$ROOT_DIR" mantle-cli chain estimate-gas \
  --to "$(jq -r '.unsigned_tx.to' "$COLLATERAL_FILE")" \
  --from "$WALLET" \
  --data "$(jq -r '.unsigned_tx.data' "$COLLATERAL_FILE")" \
  --value "$(jq -r '.unsigned_tx.value' "$COLLATERAL_FILE")" \
  --json 2>/dev/null | jq -r '.gas_limit')
echo "set-collateral gas_limit: $COLLATERAL_GAS_LIMIT"

COLLATERAL_TX=$(jq --argjson nonce "$COLLATERAL_NONCE" --arg gas_price "$GAS_PRICE_HEX" --argjson gas_limit "$COLLATERAL_GAS_LIMIT" \
  '.unsigned_tx | {to, data, value, chain_id: .chainId, nonce: $nonce, gas: $gas_limit, max_fee_per_gas: $gas_price, max_priority_fee_per_gas: $gas_price}' \
  "$COLLATERAL_FILE")

bun "$AGENT_TOKEN" sign evm-transaction \
  --caip2 "$CAIP2" \
  --transaction "$COLLATERAL_TX" \
  --broadcast

echo ""
echo "완료"
