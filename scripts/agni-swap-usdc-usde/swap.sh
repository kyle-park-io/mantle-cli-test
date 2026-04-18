#!/usr/bin/env bash
# Agni에서 USDC 0.1을 USDe로 스왑합니다.
# 순서: 1) swap-quote → 2) approve → 3) build-swap → 4) 서명+브로드캐스트

set -euo pipefail

WALLET="0x5cf08f46628b6d8ae56b1cdd5197fd12172de47e"
AMOUNT="0.1"
PROVIDER="agni"
CAIP2="eip155:5000"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
AGENT_TOKEN="$ROOT_DIR/skills/agent-token/scripts/agent-token.ts"
APPROVE_FILE="$SCRIPT_DIR/approve.json"
SWAP_FILE="$SCRIPT_DIR/swap.json"

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
# Step 1: swap-quote → minimum_out_raw / router / fee_tier 추출
# ---------------------------------------------------------------------------

echo ""
echo "[1/3] swap-quote 조회 중... (USDC $AMOUNT → USDe, $PROVIDER)"

QUOTE=$(yarn --cwd "$ROOT_DIR" mantle-cli defi swap-quote \
  --in USDC --out USDE --amount "$AMOUNT" --provider "$PROVIDER" --json 2>/dev/null)

ROUTER=$(echo "$QUOTE" | jq -r '.router_address')
MIN_OUT=$(echo "$QUOTE" | jq -r '.minimum_out_raw')
FEE_TIER=$(echo "$QUOTE" | jq -r '.fee_tier')
echo "router:          $ROUTER"
echo "minimum_out_raw: $MIN_OUT"
echo "fee_tier:        $FEE_TIER"

# ---------------------------------------------------------------------------
# Step 2: approve 트랜잭션 서명 + 브로드캐스트 (nonce N)
# ---------------------------------------------------------------------------

echo ""
echo "[2/3] approve 트랜잭션 생성 및 브로드캐스트 중... (nonce=$NONCE)"

yarn --cwd "$ROOT_DIR" mantle-cli swap approve \
  --token USDC --spender "$ROUTER" --amount "$AMOUNT" --owner "$WALLET" \
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
# Step 3: swap 트랜잭션 서명 + 브로드캐스트
# ---------------------------------------------------------------------------

echo ""
echo "[3/3] swap 트랜잭션 생성 및 브로드캐스트 중... (nonce=$NONCE)"

yarn --cwd "$ROOT_DIR" mantle-cli swap build-swap \
  --provider "$PROVIDER" \
  --in USDC --out USDE \
  --amount "$AMOUNT" \
  --recipient "$WALLET" \
  --amount-out-min "$MIN_OUT" \
  --fee-tier "$FEE_TIER" \
  --json > "$SWAP_FILE"

SWAP_GAS_LIMIT=$(yarn --cwd "$ROOT_DIR" mantle-cli chain estimate-gas \
  --to "$(jq -r '.unsigned_tx.to' "$SWAP_FILE")" \
  --from "$WALLET" \
  --data "$(jq -r '.unsigned_tx.data' "$SWAP_FILE")" \
  --value "$(jq -r '.unsigned_tx.value' "$SWAP_FILE")" \
  --json 2>/dev/null | jq -r '.gas_limit')
echo "swap gas_limit: $SWAP_GAS_LIMIT"

SWAP_TX=$(jq --argjson nonce "$NONCE" --arg gas_price "$GAS_PRICE_HEX" --argjson gas_limit "$SWAP_GAS_LIMIT" \
  '.unsigned_tx | {to, data, value, chain_id: .chainId, nonce: $nonce, gas: $gas_limit, max_fee_per_gas: $gas_price, max_priority_fee_per_gas: $gas_price}' \
  "$SWAP_FILE")

bun "$AGENT_TOKEN" sign evm-transaction \
  --caip2 "$CAIP2" \
  --transaction "$SWAP_TX" \
  --broadcast

echo ""
echo "완료"
