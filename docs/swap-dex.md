# DEX 스왑 가이드

## DEX 비교

| DEX          | provider 값    | 풀 파라미터                        | 라우팅 방식               |
| ------------ | -------------- | ---------------------------------- | ------------------------- |
| Agni         | `agni`         | `fee_tier` (100, 500, 3000, 10000) | V3 concentrated liquidity |
| Fluxion      | `fluxion`      | 없음 (CLI 내부 auto-resolve)       | V3 concentrated liquidity |
| Merchant Moe | `merchant_moe` | `bin_step` (1, 2, 25 등)           | Liquidity Book            |

---

## 전체 절차

### 1단계: swap-quote

```bash
yarn mantle-cli defi swap-quote \
  --in <token> --out <token> --amount <amount> \
  --provider <agni|fluxion|merchant_moe> \
  --json
```

반환값 중 필요한 필드:

| 필드                            | 용도                                   |
| ------------------------------- | -------------------------------------- |
| `router_address`                | approve의 spender, build-swap의 라우터 |
| `minimum_out_raw`               | build-swap의 `--amount-out-min`        |
| `fee_tier`                      | agni build-swap의 `--fee-tier`         |
| `resolved_pool_params.bin_step` | merchant_moe build-swap의 `--bin-step` |

> quote는 실시간 시세 기반이므로 조회 후 빠르게 build-swap까지 진행합니다. 시간이 지나면 `minimum_out_raw`가 맞지 않아 슬리피지로 실패할 수 있습니다.

### 2단계: approve (ERC-20 입력 토큰인 경우)

```bash
yarn mantle-cli swap approve \
  --token <token> --spender <router_address> \
  --amount <amount> --owner <wallet> \
  --json
```

- `unsigned_tx.data`가 `0x`이면 allowance가 충분한 것 → 건너뜀
- `0x`인 상태에서 브로드캐스트하면 nonce가 소비되므로 반드시 확인 후 건너뜀

### 3단계: build-swap

#### Agni

```bash
yarn mantle-cli swap build-swap \
  --provider agni \
  --in <token> --out <token> \
  --amount <amount> \
  --recipient <wallet> \
  --amount-out-min <minimum_out_raw> \
  --fee-tier <fee_tier> \
  --json
```

#### Fluxion

```bash
yarn mantle-cli swap build-swap \
  --provider fluxion \
  --in <token> --out <token> \
  --amount <amount> \
  --recipient <wallet> \
  --amount-out-min <minimum_out_raw> \
  --json
```

#### Merchant Moe

```bash
yarn mantle-cli swap build-swap \
  --provider merchant_moe \
  --in <token> --out <token> \
  --amount <amount> \
  --recipient <wallet> \
  --amount-out-min <minimum_out_raw> \
  --bin-step <bin_step> \
  --json
```

### 4단계: 서명 + 브로드캐스트

nonce, gas price, gas limit을 조회하고 Privy 형식으로 변환 후 서명합니다. 자세한 내용은 `nonce-management.md`, `gas-management.md` 참고.

```bash
bun agent-token.ts sign evm-transaction \
  --caip2 eip155:5000 \
  --transaction "$TX_FOR_SIGN" \
  --broadcast
```

---

## approve → swap 간 nonce 처리

approve와 swap을 연속으로 브로드캐스트할 때 nonce를 순차적으로 증가시킵니다.

```
approve 실행 → nonce N 소비 → swap은 N+1
approve 건너뜀 (data: 0x) → nonce 소비 없음 → swap은 N
```

두 tx가 mempool에 들어가기 전에 nonce를 재조회하면 충돌할 수 있으므로 재조회하지 않고 직접 +1합니다.

---

## build-swap의 gas 필드를 쓰지 말 것

`build-swap`은 `unsigned_tx.gas` 필드를 반환하지만 실제 필요량보다 크게 작습니다.

```
build-swap 반환: gas 0x493E0 (= 300,000)
실제 필요량:     80,963,736
→ intrinsic gas too low
```

항상 `chain estimate-gas`로 직접 조회합니다. 자세한 내용은 `gas-management.md` 참고.

---

## 확인된 스왑 쌍

| 스크립트                   | DEX          | 입력 | 출력   | 파라미터                            |
| -------------------------- | ------------ | ---- | ------ | ----------------------------------- |
| `agni-swap-usdc-weth`      | Agni         | USDC | WETH   | fee_tier: 500                       |
| `agni-swap-usdc-usde`      | Agni         | USDC | USDe   | fee_tier: 100                       |
| `agni-swap-usdc-mnt`       | Agni         | USDC | MNT    | fee_tier: 500 (USDC→WMNT 후 unwrap) |
| `fluxion-swap-usdc-wtslax` | Fluxion      | USDC | wTSLAx | 없음                                |
| `moe-swap-usdc-usde`       | Merchant Moe | USDC | USDe   | bin_step: 1                         |

fee_tier와 bin_step은 quote 시점마다 달라질 수 있으므로 항상 `swap-quote`에서 추출해서 사용합니다. 하드코딩하지 마세요.

---

## best provider 사용

특정 DEX를 지정하지 않고 최적 경로를 자동 선택할 수 있습니다.

```bash
yarn mantle-cli defi swap-quote \
  --in USDC --out WETH --amount 10 \
  --provider best \
  --json
```

`provider: best`는 agni, merchant_moe, fluxion을 모두 조회해 가장 유리한 경로를 반환합니다. 반환된 `provider` 필드를 그대로 `build-swap --provider`에 사용합니다.

---

## wrap / unwrap

MNT ↔ WMNT 변환은 swap이 아닌 별도 명령을 사용합니다.

```bash
# MNT → WMNT
yarn mantle-cli swap wrap-mnt --amount <amount> --json

# WMNT → MNT
yarn mantle-cli swap unwrap-mnt --amount <amount> --json
```

approve 불필요. `unsigned_tx`를 바로 서명하면 됩니다.
