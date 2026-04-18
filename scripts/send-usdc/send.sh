#!/usr/bin/env bash
# USDC 0.1을 지정된 주소로 전송합니다.

set -euo pipefail

WALLET="0x5cf08f46628b6d8ae56b1cdd5197fd12172de47e"
TO="0xb01edda2b28d8737deb4ba9195e4299e37c2beb2"
AMOUNT="0.1"
CAIP2="eip155:5000"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
AGENT_TOKEN="$ROOT_DIR/skills/agent-token/scripts/agent-token.ts"
TX_FILE="$SCRIPT_DIR/tx.json"

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
# Step 1: unsigned_tx 생성 → 파일로 저장
# ---------------------------------------------------------------------------

echo ""
echo "[1/2] unsigned_tx 생성 중... (to=$TO, amount=$AMOUNT USDC)"

yarn --cwd "$ROOT_DIR" mantle-cli transfer send-token \
  --token USDC \
  --to "$TO" \
  --amount "$AMOUNT" \
  --json > "$TX_FILE"

echo "unsigned_tx 저장: $TX_FILE"
cat "$TX_FILE"

# ---------------------------------------------------------------------------
# Step 2: 서명 + 브로드캐스트
# ---------------------------------------------------------------------------

echo ""
echo "[2/2] 서명 및 브로드캐스트 중... (nonce=$NONCE)"

GAS_LIMIT=$(yarn --cwd "$ROOT_DIR" mantle-cli chain estimate-gas \
  --to "$(jq -r '.unsigned_tx.to' "$TX_FILE")" \
  --from "$WALLET" \
  --data "$(jq -r '.unsigned_tx.data' "$TX_FILE")" \
  --value "$(jq -r '.unsigned_tx.value' "$TX_FILE")" \
  --json 2>/dev/null | jq -r '.gas_limit')
echo "gas_limit: $GAS_LIMIT"

TX_FOR_SIGN=$(jq --argjson nonce "$NONCE" --arg gas_price "$GAS_PRICE_HEX" --argjson gas_limit "$GAS_LIMIT" \
  '.unsigned_tx | {to, data, value, chain_id: .chainId, nonce: $nonce, gas: $gas_limit, max_fee_per_gas: $gas_price, max_priority_fee_per_gas: $gas_price}' \
  "$TX_FILE")

bun "$AGENT_TOKEN" sign evm-transaction \
  --caip2 "$CAIP2" \
  --transaction "$TX_FOR_SIGN" \
  --broadcast

echo ""
echo "완료"
