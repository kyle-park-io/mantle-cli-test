#!/usr/bin/env bash
# Aave V3에서 USDe 1을 대출합니다.
#
# 배경: WETH isolation mode 담보(LTV 80.5%) 기준
#       WETH 0.004 ≈ $10 → 가용 대출 한도 ≈ $8 → USDe 1로 여유 있게 설정
#       CLI markets에서 USDC가 borrowable_in_isolation: true로 표시되지만
#       실제 컨트랙트에서는 USDC borrow가 revert됨 (온체인 상태와 불일치)
#       USDe는 isolation mode에서 정상 borrow 가능 확인됨
# 사전 조건: aave-supply-weth/supply.sh 완료

set -euo pipefail

WALLET="0x5cf08f46628b6d8ae56b1cdd5197fd12172de47e"
AMOUNT="1"
CAIP2="eip155:5000"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
AGENT_TOKEN="$ROOT_DIR/skills/agent-token/scripts/agent-token.ts"
BORROW_FILE="$SCRIPT_DIR/borrow.json"

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
# 포지션 확인
# ---------------------------------------------------------------------------

echo ""
echo "[사전 확인] Aave 포지션 조회 중..."

POSITIONS=$(yarn --cwd "$ROOT_DIR" mantle-cli aave positions --user "$WALLET" --json 2>/dev/null)
COLLATERAL=$(echo "$POSITIONS" | jq -r '.account.total_collateral_usd')
AVAILABLE=$(echo "$POSITIONS" | jq -r '.account.available_borrows_usd')
echo "total_collateral_usd:    $COLLATERAL"
echo "available_borrows_usd:   $AVAILABLE"

# ---------------------------------------------------------------------------
# borrow USDC
# ---------------------------------------------------------------------------

echo ""
echo "[1/1] borrow 트랜잭션 생성 및 브로드캐스트 중... (nonce=$NONCE)"

yarn --cwd "$ROOT_DIR" mantle-cli aave borrow \
  --asset USDE \
  --amount "$AMOUNT" \
  --on-behalf-of "$WALLET" \
  --json > "$BORROW_FILE"

BORROW_GAS_LIMIT=$(yarn --cwd "$ROOT_DIR" mantle-cli chain estimate-gas \
  --to "$(jq -r '.unsigned_tx.to' "$BORROW_FILE")" \
  --from "$WALLET" \
  --data "$(jq -r '.unsigned_tx.data' "$BORROW_FILE")" \
  --value "$(jq -r '.unsigned_tx.value' "$BORROW_FILE")" \
  --json 2>/dev/null | jq -r '.gas_limit')
echo "borrow gas_limit: $BORROW_GAS_LIMIT"

BORROW_TX=$(jq --argjson nonce "$NONCE" --arg gas_price "$GAS_PRICE_HEX" --argjson gas_limit "$BORROW_GAS_LIMIT" \
  '.unsigned_tx | {to, data, value, chain_id: .chainId, nonce: $nonce, gas: $gas_limit, max_fee_per_gas: $gas_price, max_priority_fee_per_gas: $gas_price}' \
  "$BORROW_FILE")

bun "$AGENT_TOKEN" sign evm-transaction \
  --caip2 "$CAIP2" \
  --transaction "$BORROW_TX" \
  --broadcast

echo ""
echo "완료"
