# Gas 관리 가이드

## 개요

Privy API는 gas price와 gas limit을 자동으로 채워주지 않습니다.
`mantle-cli`의 `unsigned_tx`도 이 값들을 포함하지 않거나 (send-native, approve 등),
포함하더라도 실제 필요량보다 작을 수 있습니다 (build-swap의 `gas` 필드).

서명 전에 항상 두 값을 직접 조회해서 넣어야 합니다.

---

## gas price 조회

### chain status 사용

```bash
GAS_PRICE_WEI=$(yarn mantle-cli chain status --json | jq -r '.gas_price_wei')
GAS_PRICE_HEX=$(printf '0x%x' $(( GAS_PRICE_WEI * 12 / 10 )))  # 1.2x 버퍼
```

- `gas_price_wei`는 현재 블록의 base fee 기준값입니다.
- 네트워크 상황에 따라 base fee가 오를 수 있으므로 1.2x 버퍼를 적용합니다.
- Mantle은 EIP-1559를 지원하므로 `max_fee_per_gas`와 `max_priority_fee_per_gas` 두 필드에 동일한 값을 사용해도 무방합니다.

### Privy API 필드

```bash
TX_FOR_SIGN=$(jq --arg gas_price "$GAS_PRICE_HEX" '
  .unsigned_tx | {
    ...,
    max_fee_per_gas: $gas_price,
    max_priority_fee_per_gas: $gas_price
  }' tx.json)
```

> `gas_price` 단일 필드는 Privy가 인식하지 않습니다. EIP-1559 필드명(`max_fee_per_gas`)을 사용해야 합니다.

---

## gas limit 조회

### 항상 estimate-gas로 직접 조회

```bash
GAS_LIMIT=$(yarn mantle-cli chain estimate-gas \
  --to "$(jq -r '.unsigned_tx.to' tx.json)" \
  --from "$WALLET" \
  --data "$(jq -r '.unsigned_tx.data' tx.json)" \
  --value "$(jq -r '.unsigned_tx.value' tx.json)" \
  --json | jq -r '.gas_limit')
```

- `--from`은 필수는 아니지만 정확한 추정을 위해 항상 지정합니다.
- `--data`가 `0x`인 순수 MNT 전송도 동일하게 사용합니다.

### build-swap의 gas 필드를 믿지 말 것

`swap build-swap`은 `unsigned_tx.gas` 필드를 반환하지만 실제 필요량보다 크게 작을 수 있습니다.

```
# 실제 사례
build-swap 반환값:  gas: 0x493E0  (= 300,000)
실제 필요량:        minimum needed 80,963,736
```

`build-swap`을 포함한 모든 명령의 gas limit은 `estimate-gas`로 다시 조회합니다.

---

## approve의 data가 0x인 경우

`swap approve`는 allowance가 이미 충분하면 `unsigned_tx.data`를 `0x`로 반환합니다.
이 경우 `estimate-gas`에 `0x` calldata를 넘기면 오류가 발생합니다.

```
MISSING_CALLDATA: Target is a contract, but no calldata was provided.
```

approve를 건너뛰는 방식으로 처리합니다.

```bash
APPROVE_DATA=$(jq -r '.unsigned_tx.data' approve.json)

if [[ "$APPROVE_DATA" == "0x" ]]; then
  echo "approve 불필요 (allowance 충분) — 건너뜀"
else
  GAS_LIMIT=$(yarn mantle-cli chain estimate-gas \
    --to "$(jq -r '.unsigned_tx.to' approve.json)" \
    --from "$WALLET" \
    --data "$APPROVE_DATA" \
    --value "$(jq -r '.unsigned_tx.value' approve.json)" \
    --json | jq -r '.gas_limit')
  # (서명 및 브로드캐스트)
fi
```

---

## estimate-gas가 실패하는 경우

`chain estimate-gas`가 `GAS_ESTIMATION_FAILED`로 실패하면 gas limit이 `null`로 반환됩니다. 이 경우 이후 서명 단계에서 `intrinsic gas too low: gas 0`으로 이어집니다.

```
Error: GAS_ESTIMATION_FAILED
execution reverted
```

**원인**: tx 자체가 온체인에서 revert될 상태입니다. gas 문제가 아니라 tx 로직 문제입니다.

- aave borrow: 담보 부족, collateral_enabled: false, 지원하지 않는 자산
- aave repay: 부채 없음, approve 미완료
- swap: allowance 부족, 잘못된 pool 파라미터

**대처**: gas limit null 체크를 추가하거나, tx 전제 조건을 먼저 확인합니다.

```bash
GAS_LIMIT=$(yarn mantle-cli chain estimate-gas ... --json 2>/dev/null | jq -r '.gas_limit')
if [[ "$GAS_LIMIT" == "null" || -z "$GAS_LIMIT" ]]; then
  echo "오류: gas 추정 실패 — tx 조건 확인 필요"
  exit 1
fi
```

---

## 오류별 대처법

### `insufficient funds for gas * price + value`

MNT 잔액이 gas fee를 감당하지 못할 때 발생합니다.

```
insufficient funds for gas * price + value:
  balance 10545079035848352, tx cost 19856809765489003
```

**확인**:

```bash
yarn mantle-cli account balance <wallet> --json | jq '.balance_mnt'
```

gas fee는 tx 종류에 따라 크게 다릅니다. Aave/swap 계열은 순수 MNT 전송보다 수십 배 많은 gas를 사용하므로 MNT 잔액을 넉넉히 유지해야 합니다.

---

### `max fee per gas less than block base fee`

gas price를 지정하지 않았거나 `gas_price` 필드명을 잘못 사용했을 때 발생합니다.

**원인 1:** gas price 필드 누락

```bash
# ❌ gas price 없음
TX=$(jq '.unsigned_tx | {to, data, value, chain_id: .chainId, nonce: $nonce}' tx.json)
```

**원인 2:** 잘못된 필드명

```bash
# ❌ Privy가 인식하지 못함
--transaction '{"gas_price": "0x1700ac0", ...}'

# ✅ EIP-1559 필드명 사용
--transaction '{"max_fee_per_gas": "0x1700ac0", "max_priority_fee_per_gas": "0x1700ac0", ...}'
```

---

### `intrinsic gas too low: gas N, minimum needed M`

gas limit이 실제 필요량보다 작을 때 발생합니다.

**원인 1:** gas limit 필드 누락 → Privy가 0으로 처리

```bash
# ❌ gas 없음 → "gas 0, minimum needed 73,962,000"
TX=$(jq '.unsigned_tx | {to, data, value, chain_id, nonce, max_fee_per_gas, max_priority_fee_per_gas}' tx.json)
```

**원인 2:** `build-swap`의 gas 값 그대로 사용

```bash
# ❌ build-swap 반환값 300,000 → 실제 필요 80,963,736
GAS_LIMIT=$(jq -r '.unsigned_tx.gas' swap.json)
```

**해결:** 항상 `estimate-gas`로 조회합니다.

---

## 전체 변환 패턴

```bash
# 1. gas price
GAS_PRICE_WEI=$(yarn mantle-cli chain status --json | jq -r '.gas_price_wei')
GAS_PRICE_HEX=$(printf '0x%x' $(( GAS_PRICE_WEI * 12 / 10 )))

# 2. gas limit
GAS_LIMIT=$(yarn mantle-cli chain estimate-gas \
  --to "$(jq -r '.unsigned_tx.to' tx.json)" \
  --from "$WALLET" \
  --data "$(jq -r '.unsigned_tx.data' tx.json)" \
  --value "$(jq -r '.unsigned_tx.value' tx.json)" \
  --json | jq -r '.gas_limit')

# 3. 변환
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
