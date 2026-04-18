# Nonce 관리 가이드

## 개요

`mantle-cli`는 nonce 조회 기능을 제공하지 않습니다.
`diagnostics probe --method`의 허용 목록에 `eth_getTransactionCount`가 없고,
`account` 명령도 잔액만 반환합니다.

따라서 nonce는 퍼블릭 RPC에 직접 조회해야 합니다.

---

## nonce 조회 방법

### curl로 직접 조회 (권장)

```bash
WALLET="0x5cf08f46628b6d8ae56b1cdd5197fd12172de47e"

NONCE_HEX=$(curl -s -X POST https://rpc.mantle.xyz \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getTransactionCount\",\"params\":[\"$WALLET\",\"pending\"],\"id\":1}" \
  | jq -r '.result')

NONCE=$(( NONCE_HEX ))
```

- `"pending"` 파라미터를 사용해야 mempool에 대기 중인 트랜잭션까지 포함됩니다.
- `"latest"`를 쓰면 아직 채굴되지 않은 pending tx의 nonce와 충돌할 수 있습니다.

### diagnostics probe는 사용 불가

```bash
# ❌ 이 명령은 동작하지 않음 — eth_getTransactionCount가 허용 목록에 없음
yarn mantle-cli diagnostics probe --method eth_getTransactionCount ...
```

---

## 트랜잭션별 nonce 전략

### 단일 트랜잭션 (send-native, send-token)

nonce를 한 번 조회해서 그대로 사용합니다.

```bash
NONCE_HEX=$(curl -s -X POST https://rpc.mantle.xyz \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getTransactionCount\",\"params\":[\"$WALLET\",\"pending\"],\"id\":1}" \
  | jq -r '.result')
NONCE=$(( NONCE_HEX ))

# 트랜잭션에 nonce 포함
TX=$(jq --argjson nonce "$NONCE" \
  '.unsigned_tx | {to, data, value, chain_id: .chainId, nonce: $nonce, ...}' tx.json)
```

### 연속 트랜잭션 (approve → swap)

approve와 swap을 연속으로 브로드캐스트할 때 nonce를 순차적으로 증가시킵니다.
두 트랜잭션이 모두 mempool에 들어가기 전에 nonce를 재조회하면 충돌할 수 있으므로 재조회하지 않고 직접 +1합니다.

```bash
# 최초 nonce 조회
NONCE=$(( $(curl -s ... | jq -r '.result') ))

# approve: nonce N
# (approve 실행)
NONCE=$(( NONCE + 1 ))

# swap: nonce N+1
```

### 3개 이상 연속 트랜잭션 (approve → swap → unwrap)

3단계 이상도 동일하게 tx 성공마다 NONCE를 +1합니다.
중간 tx가 실패하면 이후 단계를 중단해야 합니다 — 실패한 tx의 nonce는 소비되지 않았으므로 재시도 시 같은 nonce를 사용합니다.

```bash
# approve (조건부)
if [[ "$APPROVE_DATA" != "0x" ]]; then
  # (approve 브로드캐스트)
  NONCE=$(( NONCE + 1 ))
fi

# swap
SWAP_RESULT=$(bun agent-token.ts sign evm-transaction ... --broadcast)
if [[ "$(echo "$SWAP_RESULT" | jq -r '.result.success')" != "true" ]]; then
  echo "swap 실패 — 이후 단계 중단"
  exit 1
fi
NONCE=$(( NONCE + 1 ))

# unwrap
# (unwrap 브로드캐스트)
```

> `set -euo pipefail` 환경에서도 브로드캐스트 결과는 exit code가 0으로 반환될 수 있습니다.
> `.result.success` 필드를 명시적으로 확인해야 중간 실패를 감지할 수 있습니다.

#### approve가 불필요한 경우 (allowance 충분)

`swap approve --owner <wallet>`은 현재 allowance를 체크합니다.
이미 충분한 allowance가 있으면 `unsigned_tx.data`를 `0x`로 반환합니다 — 실제 트랜잭션이 필요 없다는 신호입니다.

이 경우 approve를 건너뛰므로 **nonce를 증가시키지 않고** swap에 원래 nonce를 그대로 사용합니다.

```bash
APPROVE_DATA=$(jq -r '.unsigned_tx.data' approve.json)

if [[ "$APPROVE_DATA" == "0x" ]]; then
  # allowance 충분 → approve tx 없음 → nonce 그대로
  SWAP_NONCE=$NONCE
else
  # approve tx 전송 → nonce 소비 → swap은 N+1
  # (approve 서명 및 브로드캐스트)
  SWAP_NONCE=$(( NONCE + 1 ))
fi
```

> `data: 0x`인 approve를 실수로 브로드캐스트하면 nonce가 하나 소비됩니다.
> 반드시 `data` 값을 확인하고 `0x`이면 건너뜁니다.

---

## 오류별 대처법

### `nonce too low: next nonce N, tx nonce M`

현재 온체인 nonce보다 낮은 nonce를 사용했을 때 발생합니다.

```
"nonce too low: next nonce 18, tx nonce 0"
```

**원인:**

- `unsigned_tx`에 nonce를 포함하지 않으면 Privy API가 nonce를 0으로 처리합니다.
- `mantle-cli`의 `unsigned_tx`는 nonce 필드를 포함하지 않습니다.

**해결 1 (권장):** curl로 현재 pending nonce를 조회해서 직접 넣습니다.

**해결 2:** 오류 메시지의 `next nonce N` 값을 파싱해서 재시도합니다.

```bash
RESULT=$(bun agent-token.ts sign evm-transaction --transaction "$TX" --broadcast)
NEXT_NONCE=$(echo "$RESULT" | grep -oP "next nonce \K[0-9]+")

if [[ -n "$NEXT_NONCE" ]]; then
  # nonce를 오류에서 추출해 재시도
  TX_RETRY=$(echo "$TX" | jq --argjson nonce "$NEXT_NONCE" '. + {nonce: $nonce}')
  bun agent-token.ts sign evm-transaction --transaction "$TX_RETRY" --broadcast
fi
```

이 방식은 curl 없이 동작하지만, 오류 메시지 포맷에 의존하므로 권장하지 않습니다. 첫 시도부터 curl로 nonce를 조회하는 게 더 안정적입니다.

---

### `nonce too high` / 트랜잭션이 pending 상태로 멈춤

사용한 nonce가 현재 온체인 nonce보다 높을 때 발생합니다.
이전 트랜잭션들이 채굴되기를 기다리며 mempool에 쌓입니다.

**해결:** `"latest"` 기준으로 현재 확정된 nonce를 조회한 뒤, 막힌 nonce부터 동일한 nonce로 대체 트랜잭션을 전송합니다.

```bash
# 확정된 nonce 조회
CONFIRMED_NONCE=$(( $(curl -s -X POST https://rpc.mantle.xyz \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getTransactionCount\",\"params\":[\"$WALLET\",\"latest\"],\"id\":1}" \
  | jq -r '.result') ))
```

---

### `max fee per gas less than block base fee`

gas price를 지정하지 않거나 너무 낮게 지정했을 때 발생합니다.
Privy API는 gas price를 자동으로 채워주지 않습니다.

**해결:** `chain status`로 현재 gas price를 조회하고 버퍼를 적용합니다.

```bash
GAS_PRICE_WEI=$(yarn mantle-cli chain status --json | jq -r '.gas_price_wei')
GAS_PRICE_HEX=$(printf '0x%x' $(( GAS_PRICE_WEI * 12 / 10 )))  # 1.2x 버퍼
```

---

### `intrinsic gas too low: gas N, minimum needed M`

gas limit이 부족할 때 발생합니다.
`build-swap`이 반환하는 `unsigned_tx.gas` 값이 실제 필요량보다 작을 수 있습니다.

**해결:** `build-swap`의 gas 값을 쓰지 말고 항상 `estimate-gas`로 직접 조회합니다.

```bash
GAS_LIMIT=$(yarn mantle-cli chain estimate-gas \
  --to "$(jq -r '.unsigned_tx.to' tx.json)" \
  --from "$WALLET" \
  --data "$(jq -r '.unsigned_tx.data' tx.json)" \
  --value "$(jq -r '.unsigned_tx.value' tx.json)" \
  --json | jq -r '.gas_limit')
```

---

## Privy API가 요구하는 트랜잭션 필드

`mantle-cli`의 `unsigned_tx`는 Privy가 요구하는 형식과 다릅니다.
서명 전에 아래와 같이 변환해야 합니다.

| mantle-cli unsigned_tx | Privy API 필드             | 비고                |
| ---------------------- | -------------------------- | ------------------- |
| `chainId` (camelCase)  | `chain_id` (snake_case)    | 필수                |
| 없음                   | `nonce`                    | curl로 직접 조회    |
| 없음                   | `gas`                      | estimate-gas로 조회 |
| 없음                   | `max_fee_per_gas`          | chain status + 버퍼 |
| 없음                   | `max_priority_fee_per_gas` | 동일값 사용 가능    |
| `to`, `data`, `value`  | `to`, `data`, `value`      | 그대로 사용         |

```bash
TX_FOR_SIGN=$(jq \
  --argjson nonce "$NONCE" \
  --arg gas_price "$GAS_PRICE_HEX" \
  --argjson gas_limit "$GAS_LIMIT" \
  '.unsigned_tx | {
    to,
    data,
    value,
    chain_id: .chainId,
    nonce: $nonce,
    gas: $gas_limit,
    max_fee_per_gas: $gas_price,
    max_priority_fee_per_gas: $gas_price
  }' tx.json)
```
