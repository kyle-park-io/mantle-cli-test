#!/usr/bin/env bash
# Aave V3 USDe 1 대출을 상환합니다.
#
# 배경: WETH isolation mode 담보 기반으로 빌린 USDe 상환
#       USDC는 CLI markets에서 borrowable_in_isolation: true로 표시되지만
#       실제 컨트랙트에서 revert됨 → USDe로 borrow/repay 진행
#       이자가 쌓여 있을 수 있으므로 실제 부채보다 약간 더 많이 approve
# 순서: 1) approve USDC → Aave Pool → 2) repay

set -euo pipefail

WALLET="0x5cf08f46628b6d8ae56b1cdd5197fd12172de47e"
AMOUNT="max"
AAVE_POOL="0x458F293454fE0d67EC0655f3672301301DD51422"
CAIP2="eip155:5000"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
AGENT_TOKEN="$ROOT_DIR/skills/agent-token/scripts/agent-token.ts"
APPROVE_FILE="$SCRIPT_DIR/approve.json"
REPAY_FILE="$SCRIPT_DIR/repay.json"

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
# Step 1: approve USDC → Aave Pool (nonce N)
# ---------------------------------------------------------------------------

echo ""
echo "[1/2] approve USDC → Aave Pool 중... (nonce=$NONCE)"

# max는 approve 금액으로 사용 불가 → 충분한 금액(2)으로 approve
yarn --cwd "$ROOT_DIR" mantle-cli swap approve \
  --token USDE --spender "$AAVE_POOL" --amount 2 --owner "$WALLET" \
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
# Step 2: repay (nonce N 또는 N+1)
# ---------------------------------------------------------------------------

echo ""
echo "[2/2] repay 트랜잭션 생성 및 브로드캐스트 중... (nonce=$NONCE)"

yarn --cwd "$ROOT_DIR" mantle-cli aave repay \
  --asset USDE \
  --amount "$AMOUNT" \
  --on-behalf-of "$WALLET" \
  --json > "$REPAY_FILE"

REPAY_GAS_LIMIT=$(yarn --cwd "$ROOT_DIR" mantle-cli chain estimate-gas \
  --to "$(jq -r '.unsigned_tx.to' "$REPAY_FILE")" \
  --from "$WALLET" \
  --data "$(jq -r '.unsigned_tx.data' "$REPAY_FILE")" \
  --value "$(jq -r '.unsigned_tx.value' "$REPAY_FILE")" \
  --json 2>/dev/null | jq -r '.gas_limit')
echo "repay gas_limit: $REPAY_GAS_LIMIT"

REPAY_TX=$(jq --argjson nonce "$NONCE" --arg gas_price "$GAS_PRICE_HEX" --argjson gas_limit "$REPAY_GAS_LIMIT" \
  '.unsigned_tx | {to, data, value, chain_id: .chainId, nonce: $nonce, gas: $gas_limit, max_fee_per_gas: $gas_price, max_priority_fee_per_gas: $gas_price}' \
  "$REPAY_FILE")

bun "$AGENT_TOKEN" sign evm-transaction \
  --caip2 "$CAIP2" \
  --transaction "$REPAY_TX" \
  --broadcast

echo ""
echo "완료"
