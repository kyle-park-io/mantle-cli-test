#!/usr/bin/env bash
# Aave V3에서 WETH 전액을 출금합니다.
#
# 배경: WETH isolation mode 담보 전액 회수
#       부채가 남아 있으면 health factor 하락으로 실패할 수 있음
# 사전 조건: aave-repay-usdc/repay.sh 완료 (USDC 부채 전액 상환)

set -euo pipefail

WALLET="0x5cf08f46628b6d8ae56b1cdd5197fd12172de47e"
CAIP2="eip155:5000"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
AGENT_TOKEN="$ROOT_DIR/skills/agent-token/scripts/agent-token.ts"
WITHDRAW_FILE="$SCRIPT_DIR/withdraw.json"

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
DEBT=$(echo "$POSITIONS" | jq -r '.account.total_debt_usd')
echo "total_debt_usd: $DEBT"

if (( $(echo "$DEBT > 0.001" | awk '{print ($1 > $3)}') )); then
  echo "경고: 부채가 남아 있습니다 (\$$DEBT). aave-repay-usdc/repay.sh 를 먼저 실행하세요."
  exit 1
fi

# ---------------------------------------------------------------------------
# withdraw WETH (max = 전액)
# ---------------------------------------------------------------------------

echo ""
echo "[1/1] withdraw 트랜잭션 생성 및 브로드캐스트 중... (nonce=$NONCE)"

yarn --cwd "$ROOT_DIR" mantle-cli aave withdraw \
  --asset WETH \
  --amount max \
  --to "$WALLET" \
  --json > "$WITHDRAW_FILE"

WITHDRAW_GAS_LIMIT=$(yarn --cwd "$ROOT_DIR" mantle-cli chain estimate-gas \
  --to "$(jq -r '.unsigned_tx.to' "$WITHDRAW_FILE")" \
  --from "$WALLET" \
  --data "$(jq -r '.unsigned_tx.data' "$WITHDRAW_FILE")" \
  --value "$(jq -r '.unsigned_tx.value' "$WITHDRAW_FILE")" \
  --json 2>/dev/null | jq -r '.gas_limit')
echo "withdraw gas_limit: $WITHDRAW_GAS_LIMIT"

WITHDRAW_TX=$(jq --argjson nonce "$NONCE" --arg gas_price "$GAS_PRICE_HEX" --argjson gas_limit "$WITHDRAW_GAS_LIMIT" \
  '.unsigned_tx | {to, data, value, chain_id: .chainId, nonce: $nonce, gas: $gas_limit, max_fee_per_gas: $gas_price, max_priority_fee_per_gas: $gas_price}' \
  "$WITHDRAW_FILE")

bun "$AGENT_TOKEN" sign evm-transaction \
  --caip2 "$CAIP2" \
  --transaction "$WITHDRAW_TX" \
  --broadcast

echo ""
echo "완료"
