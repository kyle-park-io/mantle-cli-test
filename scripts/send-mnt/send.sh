#!/usr/bin/env bash
# MNT 0.1을 지정된 주소로 전송합니다.
# tx-pipeline-safety.md 권장 방식: 파일 저장 후 $(cat) 으로 그대로 전달

set -euo pipefail

TO="0xb01edda2b28d8737deb4ba9195e4299e37c2beb2"
AMOUNT="0.1"
CAIP2="eip155:5000"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
AGENT_TOKEN="$ROOT_DIR/skills/agent-token/scripts/agent-token.ts"
TX_FILE="$SCRIPT_DIR/tx.json"

# ---------------------------------------------------------------------------
# Step 1: unsigned_tx 생성 → 파일로 저장
# ---------------------------------------------------------------------------

echo ""
echo "[1/2] unsigned_tx 생성 중... (to=$TO, amount=$AMOUNT MNT)"

yarn --cwd "$ROOT_DIR" mantle-cli transfer send-native \
  --to "$TO" \
  --amount "$AMOUNT" \
  --json > "$TX_FILE"

echo "unsigned_tx 저장: $TX_FILE"
cat "$TX_FILE"

# ---------------------------------------------------------------------------
# Step 2: agent-token으로 서명 + 브로드캐스트
# ---------------------------------------------------------------------------

echo ""
echo "[2/2] 서명 및 브로드캐스트 중..."

# 현재 가스 가격 조회 후 1.2x 버퍼 적용
GAS_PRICE_WEI=$(yarn --cwd "$ROOT_DIR" mantle-cli chain status --json 2>/dev/null | jq -r '.gas_price_wei')
GAS_PRICE_HEX=$(printf '0x%x' $(( GAS_PRICE_WEI * 12 / 10 )))
echo "gas_price: $GAS_PRICE_WEI wei → $GAS_PRICE_HEX (1.2x)"

# nonce: rpc.mantle.xyz 직접 조회 (CLI에 eth_getTransactionCount 없음)
WALLET="0x5cf08f46628b6d8ae56b1cdd5197fd12172de47e"
NONCE_HEX=$(curl -s -X POST https://rpc.mantle.xyz \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getTransactionCount\",\"params\":[\"$WALLET\",\"pending\"],\"id\":1}" \
  | jq -r '.result')
NONCE=$(( NONCE_HEX ))
echo "nonce: $NONCE_HEX → $NONCE"

# gas limit 추정
TX_TO=$(jq -r '.unsigned_tx.to' "$TX_FILE")
TX_DATA=$(jq -r '.unsigned_tx.data' "$TX_FILE")
TX_VALUE=$(jq -r '.unsigned_tx.value' "$TX_FILE")
GAS_LIMIT=$(yarn --cwd "$ROOT_DIR" mantle-cli chain estimate-gas \
  --to "$TX_TO" --from "$WALLET" \
  --data "$TX_DATA" --value "$TX_VALUE" --json 2>/dev/null | jq -r '.gas_limit')
echo "gas_limit: $GAS_LIMIT"

# Privy API: snake_case chain_id, nonce, gas, EIP-1559 fee 필드 필요
TX_FOR_SIGN=$(jq --argjson nonce "$NONCE" --arg gas_price "$GAS_PRICE_HEX" --argjson gas_limit "$GAS_LIMIT" \
  '.unsigned_tx | {to, data, value, chain_id: .chainId, nonce: $nonce, gas: $gas_limit, max_fee_per_gas: $gas_price, max_priority_fee_per_gas: $gas_price}' "$TX_FILE")

bun "$AGENT_TOKEN" sign evm-transaction \
  --caip2 "$CAIP2" \
  --transaction "$TX_FOR_SIGN" \
  --broadcast

echo ""
echo "완료"
