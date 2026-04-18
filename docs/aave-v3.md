# Aave V3 Mantle 운용 가이드

## 자산 현황

### 담보 가능 자산 (LTV > 0)

| 자산 | LTV   | 청산 임계값 | isolation mode | debt ceiling |
| ---- | ----- | ----------- | -------------- | ------------ |
| WETH | 80.5% | 83%         | ✅ (isolation) | $30,000,000  |
| WMNT | 40%   | 45%         | ✅ (isolation) | $2,000,000   |

- **WETH만 실질적으로 사용 가능**: WMNT는 `borrowing_enabled: false`라 담보로 공급해도 아무것도 빌릴 수 없음
- WETH는 isolation mode — 공급하면 해당 계정 전체가 isolation mode로 진입

### 공급 가능하지만 담보 불가 (LTV = 0)

| 자산      | supply APY | 용도                        |
| --------- | ---------- | --------------------------- |
| USDC      | 2.36%      | 이자 수익만 가능, 담보 불가 |
| USDe      | 0.03%      | 이자 수익만 가능, 담보 불가 |
| USDT0     | 2.41%      | 이자 수익만 가능, 담보 불가 |
| GHO       | 0.87%      | 이자 수익만 가능, 담보 불가 |
| sUSDe     | —          | borrowing_enabled: false    |
| FBTC      | —          | borrowing_enabled: false    |
| syrupUSDT | —          | borrowing_enabled: false    |
| wrsETH    | —          | borrowing_enabled: false    |

### isolation mode에서 borrow 가능한 자산

CLI markets에서 `borrowable_in_isolation: true`로 표시되는 자산:

| 자산  | CLI 표시 | 실제 동작                   |
| ----- | -------- | --------------------------- |
| USDe  | ✅       | ✅ 정상 동작 확인           |
| USDT0 | ✅       | 미확인                      |
| GHO   | ✅       | 미확인                      |
| USDC  | ✅       | ❌ 실제 컨트랙트에서 revert |

> **주의**: USDC는 CLI에서 `borrowable_in_isolation: true`로 표시되지만 실제 borrow 트랜잭션이 `execution reverted`로 실패합니다. USDe를 사용하세요.

---

## WETH 담보 기반 borrow 전체 절차

### 사전 준비: WETH 확보

WETH를 보유하지 않은 경우 스왑으로 먼저 확보합니다.

```bash
bash scripts/agni-swap-usdc-weth/swap.sh
# USDC 10 → WETH (agni, fee_tier 500)
```

### 1단계: supply + set-collateral

```bash
bash scripts/aave-supply-weth/supply.sh
```

내부 순서:

1. `swap approve` WETH → Aave Pool (allowance 충분하면 건너뜀)
2. `aave supply` WETH
3. `aave set-collateral` WETH 활성화

**set-collateral이 필요한 이유**: supply 직후 `collateral_enabled: false` 상태입니다. set-collateral을 실행하지 않으면 `total_collateral_usd: 0`으로 조회되어 borrow가 불가합니다.

### 2단계: 대기

supply + set-collateral tx가 채굴된 후 `aave positions`에 반영되기까지 **수 초~수십 초**의 지연이 있습니다.

```bash
# 포지션 확인
yarn mantle-cli aave positions --user <wallet> --json
# total_collateral_usd > 0, collateral_enabled: true 확인 후 진행
```

반영 전에 borrow를 실행하면:

- `total_collateral_usd: 0`으로 조회되어 스크립트의 사전 확인에서 차단
- 또는 estimate-gas 단계에서 `execution reverted`

### 3단계: borrow

```bash
bash scripts/aave-borrow-usdc/borrow.sh
# 실제 내용: USDe 1 borrow (파일명과 다름 — USDC borrow 불가 이슈로 변경됨)
```

- borrow는 approve 불필요 (빌리는 쪽이므로)
- 포지션 사전 확인 후 진행

### 4단계: repay

```bash
bash scripts/aave-repay-usdc/repay.sh
# 실제 내용: USDe max 상환
```

내부 순서:

1. `swap approve` USDe → Aave Pool (고정 금액 2로 approve, max 사용 불가)
2. `aave repay --amount max`

**max 사용 이유**: 이자가 미량 누적되어 원금(1 USDe)만 repay하면 잔여 부채가 남습니다. `max`를 사용해야 이자까지 전액 상환됩니다.

**approve에 max 사용 불가**: `swap approve --amount max`는 동작하지만 `repay --amount max`와 같이 쓸 때 allowance가 맞지 않을 수 있습니다. 충분한 고정 금액(원금 + 여유분)으로 approve합니다.

### 5단계: withdraw

```bash
bash scripts/aave-withdraw-weth/withdraw.sh
```

- 부채가 `0.001` 이상이면 실행 차단
- `aave withdraw --amount max`로 전액 출금

**부채 잔여 확인**: repay 후에도 `total_debt_usd`가 `0.00000001` 수준으로 남을 수 있습니다. 이는 이자 누적 때문이며, repay를 `max`로 했다면 실제 잔여 부채는 없고 positions RPC 응답의 지연입니다. 잠시 후 재시도하거나 임계값을 낮춰서 진행합니다.

---

## 실패 사례 및 원인

### USDC supply 후 borrow 불가

```
aave set-collateral --asset USDC
→ Error: LTV_IS_ZERO
```

USDC는 Mantle Aave V3 거버넌스에서 LTV=0으로 설정되어 있습니다. supply는 가능하지만 담보로 인정되지 않아 borrow를 이어갈 수 없습니다. USDC supply는 이자 수익 목적으로만 유효합니다.

### USDC borrow revert (isolation mode)

```
chain estimate-gas → execution reverted
```

CLI의 `aave markets`에서 USDC가 `borrowable_in_isolation: true`로 표시되지만 실제 컨트랙트에서 WETH isolation mode 담보로 USDC를 borrow하면 revert됩니다. USDe, USDT0, GHO를 사용하세요.

### supply 직후 borrow 실패

```
aave positions → total_collateral_usd: 0
```

supply + set-collateral tx가 채굴된 직후에도 positions RPC가 즉시 반영되지 않습니다. 수 초 대기 후 `total_collateral_usd > 0`을 확인하고 진행합니다.

### repay 후 withdraw 실패

```
total_debt_usd: 0.00000001 → 부채 잔여 경고
```

이자가 미량 누적된 상태에서 원금만 repay하면 잔여 부채가 남습니다. repay는 항상 `--amount max`를 사용합니다.

---

## 스크립트 구조 및 실행 순서

```
scripts/
  agni-swap-usdc-weth/   swap.sh        # WETH 확보 (USDC → WETH)
  aave-supply-weth/      supply.sh      # supply + set-collateral (3단계)
  aave-borrow-usdc/      borrow.sh      # USDe borrow (파일명 주의: 실제 USDe)
  aave-repay-usdc/       repay.sh       # USDe max repay (파일명 주의: 실제 USDe)
  aave-withdraw-weth/    withdraw.sh    # WETH 전액 출금
```

**실행 순서**:

```
swap → supply → (대기) → borrow → repay → withdraw
```

각 스크립트는 독립적으로 실행 가능하며, nonce와 gas price를 매 실행마다 새로 조회합니다.

---

## Aave 관련 CLI 명령 요약

```bash
# 포지션 조회
yarn mantle-cli aave positions --user <wallet> --json

# 시장 정보
yarn mantle-cli aave markets --json
yarn mantle-cli aave markets --asset WETH --json

# 트랜잭션 빌드 (서명 불포함)
yarn mantle-cli aave supply --asset WETH --amount 0.004 --on-behalf-of <wallet> --json
yarn mantle-cli aave borrow --asset USDE --amount 1 --on-behalf-of <wallet> --json
yarn mantle-cli aave repay --asset USDE --amount max --on-behalf-of <wallet> --json
yarn mantle-cli aave withdraw --asset WETH --amount max --to <wallet> --json
yarn mantle-cli aave set-collateral --asset WETH --user <wallet> --json
```

모든 명령은 `unsigned_tx`만 반환합니다. 서명 및 브로드캐스트는 `agent-token sign evm-transaction --broadcast`로 별도 처리합니다. nonce, gas price, gas limit은 항상 직접 조회해서 넣어야 합니다 (`nonce-management.md`, `gas-management.md` 참고).
