# mantle-cli 명령어 레퍼런스

> `@mantleio/mantle-cli` v0.1.x — Mantle L2 체인 읽기, DeFi 조회, 스왑, LP, Aave 작업을 위한 CLI

---

## 전역 옵션

모든 명령어에서 사용 가능한 옵션입니다.

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `-V, --version` | 버전 출력 | |
| `-n, --network <network>` | 대상 네트워크 (`mainnet`, `sepolia`) | `mainnet` |
| `--json` | 원시 JSON 출력 | `false` |
| `--no-color` | 색상 출력 비활성화 | |
| `--rpc-url <url>` | RPC 엔드포인트 수동 지정 | |
| `-h, --help` | 도움말 출력 | |

---

## 명령어 목록

| 명령어 | 설명 |
|--------|------|
| [`chain`](#chain) | 체인 정보 조회 |
| [`registry`](#registry) | 주소 확인 및 검증 |
| [`account`](#account) | 지갑 및 계정 조회 |
| [`token`](#token) | 토큰 메타데이터 및 조회 |
| [`defi`](#defi) | DeFi 읽기 전용 작업 |
| [`swap`](#swap) | DEX 스왑 및 토큰 작업 (미서명 트랜잭션 생성) |
| [`transfer`](#transfer) | 토큰 전송 (미서명 트랜잭션 생성) |
| [`aave`](#aave) | Aave V3 대출 작업 (미서명 트랜잭션 생성) |
| [`lp`](#lp) | 유동성 공급 작업 (미서명 트랜잭션 생성) |
| [`indexer`](#indexer) | 서브그래프 및 SQL 쿼리 |
| [`diagnostics`](#diagnostics) | RPC 상태 및 프로빙 |
| [`catalog`](#catalog) | 사용 가능한 도구 탐색 |
| [`utils`](#utils) | 안전한 인코딩/디코딩 유틸리티 |

---

## chain

체인 정보를 조회합니다.

```
mantle-cli chain <subcommand>
```

### chain info

mainnet 또는 sepolia의 정적 체인 설정을 출력합니다.

```bash
mantle-cli chain info
```

### chain status

Mantle RPC로부터 현재 블록 높이와 가스 가격을 가져옵니다.

```bash
mantle-cli chain status
```

### chain tx

트랜잭션 해시로 온체인 트랜잭션 영수증을 가져옵니다.

```bash
mantle-cli chain tx --hash <hash>
```

| 옵션 | 설명 |
|------|------|
| `--hash <hash>` | 트랜잭션 해시 (0x 접두사 포함) |

### chain estimate-gas

미서명 트랜잭션의 가스 비용을 추정합니다.

```bash
mantle-cli chain estimate-gas --to <address> --data <hex> [--from <address>] [--value <hex>]
```

| 옵션 | 설명 |
|------|------|
| `--to <address>` | unsigned_tx의 대상 컨트랙트 주소 |
| `--from <address>` | 컨텍스트 기반 추정을 위한 발신자 주소 (권장) |
| `--data <hex>` | unsigned_tx의 calldata (hex 문자열) |
| `--value <hex>` | unsigned_tx의 value (hex 문자열, 기본: `0x0`) |

---

## registry

주소를 확인하고 검증합니다.

```
mantle-cli registry <subcommand>
```

### registry resolve

키, 별칭, 또는 레이블로 신뢰할 수 있는 컨트랙트 주소를 조회합니다.

```bash
mantle-cli registry resolve <identifier> [--category <category>]
```

| 인수/옵션 | 설명 | 기본값 |
|-----------|------|--------|
| `<identifier>` | 레지스트리 키, 별칭, 또는 레이블 | |
| `--category <category>` | 카테고리 필터 (`system`, `token`, `bridge`, `defi`, `any`) | `any` |

### registry validate

주소 형식, 체크섬, 바이트코드 존재 여부를 검증합니다.

```bash
mantle-cli registry validate <address> [--check-code]
```

| 인수/옵션 | 설명 |
|-----------|------|
| `<address>` | 검증할 주소 |
| `--check-code` | 배포된 바이트코드 존재 여부 확인 |

---

## account

지갑 및 계정을 조회합니다.

```
mantle-cli account <subcommand>
```

### account balance

주소의 네이티브 MNT 잔액을 조회합니다.

```bash
mantle-cli account balance <address>
```

### account token-balances

ERC-20 토큰 잔액을 일괄 조회합니다.

```bash
mantle-cli account token-balances <address> [--tokens <tokens>]
```

| 인수/옵션 | 설명 |
|-----------|------|
| `<address>` | 지갑 주소 |
| `--tokens <tokens>` | 쉼표로 구분된 토큰 심볼 또는 주소 |

### account allowances

ERC-20 허용량(allowance)을 일괄 조회합니다.

```bash
mantle-cli account allowances <owner> --pairs <pairs>
```

| 인수/옵션 | 설명 |
|-----------|------|
| `<owner>` | 소유자 주소 |
| `--pairs <pairs>` | 쉼표로 구분된 `token:spender` 쌍 |

---

## token

토큰 메타데이터를 조회합니다.

```
mantle-cli token <subcommand>
```

### token info

ERC-20 토큰 메타데이터(이름, 심볼, 소수점, 총 공급량)를 읽습니다.

```bash
mantle-cli token info <token>
```

### token prices

토큰 가격을 조회합니다 (신뢰할 수 있는 소스가 없는 경우 null).

```bash
mantle-cli token prices --tokens <tokens> [--base-currency <currency>]
```

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--tokens <tokens>` | 쉼표로 구분된 토큰 심볼 또는 주소 | |
| `--base-currency <currency>` | 기준 통화 (`usd`, `mnt`) | `usd` |

### token resolve

토큰 심볼을 quick-ref + 표준 토큰 목록으로 조회합니다.

```bash
mantle-cli token resolve <symbol> [--no-token-list-check]
```

| 인수/옵션 | 설명 |
|-----------|------|
| `<symbol>` | 조회할 토큰 심볼 |
| `--no-token-list-check` | 표준 토큰 목록 매칭 검사 건너뜀 |

---

## defi

DeFi 읽기 전용 작업을 수행합니다.

```
mantle-cli defi <subcommand>
```

### defi swap-quote

Agni, Fluxion, Merchant Moe에서 스왑 견적을 가져옵니다.

```bash
mantle-cli defi swap-quote --in <token> --out <token> --amount <amount> [--provider <provider>] [--fee-tier <tier>]
```

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--in <token>` | 입력 토큰 심볼 또는 주소 | |
| `--out <token>` | 출력 토큰 심볼 또는 주소 | |
| `--amount <amount>` | 사람이 읽을 수 있는 입력 수량 | |
| `--provider <provider>` | 라우팅 제공자 (`agni`, `merchant_moe`, `best`) | `best` |
| `--fee-tier <tier>` | V3 수수료 등급 (선택사항) | |

### defi pool-liquidity

풀 예비금 및 유동성 메타데이터를 읽습니다.

```bash
mantle-cli defi pool-liquidity <pool-address> [--provider <provider>]
```

| 인수/옵션 | 설명 | 기본값 |
|-----------|------|--------|
| `<pool-address>` | 풀 컨트랙트 주소 | |
| `--provider <provider>` | DEX 제공자 (`agni`, `merchant_moe`) | `agni` |

### defi pool-opportunities

토큰 쌍에 대한 풀을 스캔하고 순위를 매깁니다.

```bash
mantle-cli defi pool-opportunities --token-a <token> --token-b <token> [--provider <provider>] [--max-results <n>]
```

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--token-a <token>` | 첫 번째 토큰 심볼 또는 주소 | |
| `--token-b <token>` | 두 번째 토큰 심볼 또는 주소 | |
| `--provider <provider>` | DEX 제공자 필터 (`agni`, `merchant_moe`, `all`) | `all` |
| `--max-results <n>` | 최대 결과 수 (1-10) | `5` |

### defi tvl

Mantle DeFi 프로토콜의 TVL을 조회합니다.

```bash
mantle-cli defi tvl [--protocol <protocol>]
```

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--protocol <protocol>` | 프로토콜 (`agni`, `merchant_moe`, `all`) | `all` |

### defi lending-markets

Aave V3 대출 시장 지표를 조회합니다.

```bash
mantle-cli defi lending-markets [--protocol <protocol>] [--asset <asset>]
```

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--protocol <protocol>` | 대출 프로토콜 (`aave_v3`, `all`) | `all` |
| `--asset <asset>` | 자산 필터 (심볼 또는 주소, 선택사항) | |

### defi lb-state

Merchant Moe LB 페어의 온체인 상태를 읽습니다 (활성 빈, 예비금).

```bash
mantle-cli defi lb-state --pair <address>
# 또는
mantle-cli defi lb-state --token-a <token> --token-b <token> --bin-step <step>
```

| 옵션 | 설명 |
|------|------|
| `--pair <address>` | LB 페어 주소 |
| `--token-a <token>` | 첫 번째 토큰 심볼 또는 주소 |
| `--token-b <token>` | 두 번째 토큰 심볼 또는 주소 |
| `--bin-step <step>` | LB 빈 스텝 |

### defi analyze-pool

V3 풀 심층 분석 (수수료 APR, 다중 범위 APR 비교, 위험 평가, 수익 예측).

```bash
mantle-cli defi analyze-pool --pool <address> [--investment <usd>]
# 또는
mantle-cli defi analyze-pool --token-a <token> --token-b <token> --fee-tier <tier> --provider <provider>
```

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--pool <address>` | V3 풀 주소 | |
| `--token-a <token>` | 첫 번째 토큰 심볼 또는 주소 | |
| `--token-b <token>` | 두 번째 토큰 심볼 또는 주소 | |
| `--fee-tier <tier>` | V3 수수료 등급 (`500`, `3000`, `10000`) | |
| `--provider <provider>` | DEX 제공자 (`agni`, `fluxion`) | |
| `--investment <usd>` | 수익 예측을 위한 USD 금액 | `1000` |

---

## swap

DEX 스왑 및 토큰 작업을 위한 미서명 트랜잭션을 생성합니다.

```
mantle-cli swap <subcommand>
```

### swap build-swap

Agni, Fluxion, 또는 Merchant Moe용 미서명 스왑 트랜잭션을 생성합니다.

```bash
mantle-cli swap build-swap --provider <provider> --in <token> --out <token> --amount <amount> --recipient <address> [options]
```

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--provider <provider>` | DEX 제공자: `agni`, `fluxion`, `merchant_moe` | |
| `--in <token>` | 입력 토큰 심볼 또는 주소 | |
| `--out <token>` | 출력 토큰 심볼 또는 주소 | |
| `--amount <amount>` | 입력 토큰의 사람이 읽을 수 있는 수량 | |
| `--recipient <address>` | 출력 토큰을 받을 주소 | |
| `--amount-out-min <amount>` | 최소 출력 수량 (swap-quote의 raw 단위) | |
| `--slippage-bps <bps>` | 슬리피지 허용치 (basis points, 50 = 0.5%) | `50` |
| `--fee-tier <tier>` | V3 수수료 등급 (`500`, `3000`, `10000`) | |
| `--bin-step <step>` | LB 빈 스텝 (`1`, `2`, `25`) | |
| `--quote-provider <provider>` | 이전 swap-quote의 제공자 (상호 검증용) | |
| `--quote-fee-tier <tier>` | 이전 견적의 수수료 등급 (상호 검증용) | |
| `--quote-bin-step <step>` | 이전 견적의 빈 스텝 (상호 검증용) | |

### swap approve

화이트리스트 spender에 대한 미서명 ERC-20 approve 트랜잭션을 생성합니다.

```bash
mantle-cli swap approve --token <token> --spender <address> --amount <amount> [--owner <address>]
```

| 옵션 | 설명 |
|------|------|
| `--token <token>` | 토큰 심볼 또는 주소 |
| `--spender <address>` | 승인할 컨트랙트 주소 (화이트리스트) |
| `--amount <amount>` | 승인할 소수 수량, 또는 무제한의 경우 `max` |
| `--owner <address>` | 지갑 주소 (기존 허용량 확인용) |

### swap wrap-mnt

MNT → WMNT 래핑 미서명 트랜잭션을 생성합니다.

```bash
mantle-cli swap wrap-mnt --amount <amount>
```

### swap unwrap-mnt

WMNT → MNT 언래핑 미서명 트랜잭션을 생성합니다.

```bash
mantle-cli swap unwrap-mnt --amount <amount>
```

### swap pairs

DEX별 알려진 거래 페어와 풀 파라미터를 나열합니다.

```bash
mantle-cli swap pairs [--provider <provider>]
```

| 옵션 | 설명 |
|------|------|
| `--provider <provider>` | DEX 필터: `agni`, `fluxion`, `merchant_moe` |

---

## transfer

토큰 전송을 위한 미서명 트랜잭션을 생성합니다.

```
mantle-cli transfer <subcommand>
```

### transfer send-native

네이티브 MNT 전송 미서명 트랜잭션을 생성합니다.

```bash
mantle-cli transfer send-native --to <address> --amount <amount>
```

| 옵션 | 설명 |
|------|------|
| `--to <address>` | 수신자 주소 |
| `--amount <amount>` | 전송할 MNT의 소수 수량 |

### transfer send-token

ERC-20 토큰 전송 미서명 트랜잭션을 생성합니다.

```bash
mantle-cli transfer send-token --token <token> --to <address> --amount <amount>
```

| 옵션 | 설명 |
|------|------|
| `--token <token>` | 토큰 심볼 또는 주소 |
| `--to <address>` | 수신자 주소 |
| `--amount <amount>` | 전송할 토큰의 소수 수량 |

---

## aave

Aave V3 대출 작업을 위한 미서명 트랜잭션을 생성합니다.

```
mantle-cli aave <subcommand>
```

### aave supply

Aave V3 공급(예치) 미서명 트랜잭션을 생성합니다. 먼저 Pool 컨트랙트에 자산을 approve해야 합니다.

```bash
mantle-cli aave supply --asset <token> --amount <amount> [--on-behalf-of <address>]
```

| 옵션 | 설명 |
|------|------|
| `--asset <token>` | 공급할 토큰 심볼 또는 주소 |
| `--amount <amount>` | 공급할 소수 수량 |
| `--on-behalf-of <address>` | aToken을 받을 주소 (일반적으로 발신자) |

### aave borrow

Aave V3 대출 미서명 트랜잭션을 생성합니다. 충분한 담보가 먼저 예치되어야 합니다.

```bash
mantle-cli aave borrow --asset <token> --amount <amount> [--on-behalf-of <address>] [--interest-rate-mode <mode>]
```

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--asset <token>` | 대출할 토큰 심볼 또는 주소 | |
| `--amount <amount>` | 대출할 소수 수량 | |
| `--on-behalf-of <address>` | 담보가 있는 대출자 주소 | |
| `--interest-rate-mode <mode>` | `2` = 변동금리, `1` = 고정금리 | `2` |

### aave repay

Aave V3 상환 미서명 트랜잭션을 생성합니다. 전액 상환을 위해 `--amount max` 사용.

```bash
mantle-cli aave repay --asset <token> --amount <amount> [--on-behalf-of <address>] [--interest-rate-mode <mode>]
```

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--asset <token>` | 상환할 토큰 심볼 또는 주소 | |
| `--amount <amount>` | 상환할 소수 수량, 전액의 경우 `max` | |
| `--on-behalf-of <address>` | 상환할 대출자 주소 | |
| `--interest-rate-mode <mode>` | `2` = 변동금리, `1` = 고정금리 | `2` |

### aave withdraw

Aave V3 출금 미서명 트랜잭션을 생성합니다. 전액 출금을 위해 `--amount max` 사용.

```bash
mantle-cli aave withdraw --asset <token> --amount <amount> --to <address>
```

| 옵션 | 설명 |
|------|------|
| `--asset <token>` | 출금할 토큰 심볼 또는 주소 |
| `--amount <amount>` | 출금할 소수 수량, 전액의 경우 `max` |
| `--to <address>` | 출금된 토큰을 받을 주소 |

### aave set-collateral

Aave V3에서 공급된 자산을 담보로 활성화/비활성화하는 미서명 트랜잭션을 생성합니다.

```bash
mantle-cli aave set-collateral --asset <token> [--user <address>] [--disable]
```

| 옵션 | 설명 |
|------|------|
| `--asset <token>` | 토큰 심볼 또는 주소 |
| `--user <address>` | 사전 검사를 위한 지갑 주소 (트랜잭션에 인코딩되지 않음) |
| `--disable` | 담보로 비활성화 (기본: 활성화) |

### aave positions

지갑의 Aave V3 포지션(공급된 담보, 부채, 헬스 팩터, 예비금 분류)을 조회합니다.

```bash
mantle-cli aave positions --user <address>
```

### aave markets

Aave V3 대출 시장 지표를 조회합니다 (`defi lending-markets`의 단축 명령어).

```bash
mantle-cli aave markets [--asset <asset>]
```

---

## lp

유동성 공급 작업을 위한 미서명 트랜잭션을 생성합니다.

```
mantle-cli lp <subcommand>
```

### lp add

유동성 추가 미서명 트랜잭션을 생성합니다. V3(agni/fluxion)는 NFT 포지션을 발행하고, Merchant Moe LB는 빈에 추가합니다.

```bash
mantle-cli lp add --provider <provider> --token-a <token> --token-b <token> --recipient <address> [options]
```

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--provider <provider>` | DEX 제공자: `agni`, `fluxion`, `merchant_moe` | |
| `--token-a <token>` | 첫 번째 토큰 심볼 또는 주소 | |
| `--token-b <token>` | 두 번째 토큰 심볼 또는 주소 | |
| `--amount-a <amount>` | 토큰 A의 소수 수량 (--amount-usd 미사용 시 필수) | |
| `--amount-b <amount>` | 토큰 B의 소수 수량 (--amount-usd 미사용 시 필수) | |
| `--amount-usd <usd>` | 투자할 USD 금액 (라이브 가격 및 풀 상태로 자동 분배) | |
| `--recipient <address>` | LP 포지션을 받을 주소 | |
| `--slippage-bps <bps>` | 슬리피지 허용치 (basis points) | `50` |
| `--fee-tier <tier>` | V3 수수료 등급 (agni/fluxion용) | `3000` |
| `--tick-lower <tick>` | 하단 틱 범위 (agni/fluxion용, 기본: 전체 범위) | |
| `--tick-upper <tick>` | 상단 틱 범위 (agni/fluxion용, 기본: 전체 범위) | |
| `--bin-step <step>` | LB 빈 스텝 (merchant_moe용) | `25` |
| `--active-id <id>` | 활성 빈 ID (merchant_moe용) | |
| `--id-slippage <slippage>` | 빈 ID 슬리피지 허용치 (merchant_moe용) | |
| `--delta-ids <json>` | 상대적 빈 ID (JSON 배열, merchant_moe용) | |
| `--distribution-x <json>` | 빈당 토큰 X 분배 (JSON 배열, merchant_moe용) | |
| `--distribution-y <json>` | 빈당 토큰 Y 분배 (JSON 배열, merchant_moe용) | |

### lp remove

유동성 제거 미서명 트랜잭션을 생성합니다. V3는 decreaseLiquidity+collect, Merchant Moe LB는 빈에서 제거합니다.

```bash
# V3 (agni/fluxion)
mantle-cli lp remove --provider <agni|fluxion> --token-id <id> --recipient <address> [--liquidity <amount>|--percentage <pct>]

# Merchant Moe LB
mantle-cli lp remove --provider merchant_moe --token-a <token> --token-b <token> --bin-step <step> --ids <json> --amounts <json> --recipient <address>
```

| 옵션 | 설명 |
|------|------|
| `--provider <provider>` | DEX 제공자: `agni`, `fluxion`, `merchant_moe` |
| `--recipient <address>` | 출금된 토큰을 받을 주소 |
| `--token-id <id>` | V3 NFT 포지션 토큰 ID (agni/fluxion용) |
| `--liquidity <amount>` | 제거할 정확한 유동성 수량 (agni/fluxion용) |
| `--percentage <pct>` | 제거할 포지션 비율 1-100 (agni/fluxion용, 온체인에서 유동성 읽기) |
| `--token-a <token>` | 첫 번째 토큰 (merchant_moe용) |
| `--token-b <token>` | 두 번째 토큰 (merchant_moe용) |
| `--bin-step <step>` | LB 빈 스텝 (merchant_moe용) |
| `--ids <json>` | 제거할 빈 ID (JSON 배열, merchant_moe용) |
| `--amounts <json>` | 빈당 수량 (JSON 배열, merchant_moe용) |

### lp positions

Agni와 Fluxion의 V3 LP 포지션을 나열합니다.

```bash
mantle-cli lp positions --owner <address> [--provider <provider>] [--include-empty]
```

| 옵션 | 설명 |
|------|------|
| `--owner <address>` | 조회할 지갑 주소 |
| `--provider <provider>` | 제공자 필터: `agni` 또는 `fluxion` |
| `--include-empty` | 유동성이 0인 포지션 포함 |

### lp lb-positions

지갑의 Merchant Moe Liquidity Book LP 포지션을 스캔합니다 (활성 빈 ±25 빈 확인).

```bash
mantle-cli lp lb-positions --owner <address>
```

### lp pool-state

V3 풀의 온체인 상태(틱, 가격, 유동성)를 읽습니다.

```bash
mantle-cli lp pool-state --pool <address> [--provider <provider>]
# 또는
mantle-cli lp pool-state --token-a <token> --token-b <token> --fee-tier <tier> [--provider <provider>]
```

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--pool <address>` | 풀 컨트랙트 주소 | |
| `--token-a <token>` | 첫 번째 토큰 심볼 또는 주소 | |
| `--token-b <token>` | 두 번째 토큰 심볼 또는 주소 | |
| `--fee-tier <tier>` | V3 수수료 등급 | |
| `--provider <provider>` | DEX 제공자: `agni` 또는 `fluxion` | `agni` |

### lp collect-fees

V3 수수료 수집 미서명 트랜잭션을 생성합니다.

```bash
mantle-cli lp collect-fees --provider <provider> --token-id <id> --recipient <address>
```

| 옵션 | 설명 |
|------|------|
| `--provider <provider>` | DEX 제공자: `agni` 또는 `fluxion` |
| `--token-id <id>` | V3 NFT 포지션 토큰 ID |
| `--recipient <address>` | 수집된 수수료를 받을 주소 |

### lp suggest-ticks

V3 LP를 위한 틱 범위를 제안합니다 (wide/moderate/tight 전략).

```bash
mantle-cli lp suggest-ticks --pool <address> [--provider <provider>]
# 또는
mantle-cli lp suggest-ticks --token-a <token> --token-b <token> --fee-tier <tier> [--provider <provider>]
```

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--pool <address>` | 풀 컨트랙트 주소 | |
| `--token-a <token>` | 첫 번째 토큰 심볼 또는 주소 | |
| `--token-b <token>` | 두 번째 토큰 심볼 또는 주소 | |
| `--fee-tier <tier>` | V3 수수료 등급 | |
| `--provider <provider>` | DEX 제공자: `agni` 또는 `fluxion` | `agni` |

### lp top-pools

Mantle 생태계 전체에서 최고의 LP 기회를 발견합니다. 토큰 쌍 불필요.

```bash
mantle-cli lp top-pools [--sort-by <metric>] [--limit <n>] [--provider <dex>] [--min-tvl <usd>]
```

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--sort-by <metric>` | 정렬 기준: `volume`, `apr`, `tvl` | `volume` |
| `--limit <n>` | 반환할 최대 풀 수 (최대 50) | `20` |
| `--provider <dex>` | DEX 필터: `agni`, `fluxion`, `merchant_moe` | |
| `--min-tvl <usd>` | 최소 TVL (USD) | `0` |

### lp find-pools

Agni, Fluxion, Merchant Moe에서 토큰 쌍의 모든 가능한 풀을 발견합니다 (팩토리 컨트랙트 온체인 쿼리).

```bash
mantle-cli lp find-pools --token-a <token> --token-b <token>
```

### lp analyze

풀 심층 분석 (수수료 APR, 다중 범위 비교, 위험 점수, 투자 예측).

```bash
mantle-cli lp analyze --pool <address> [--provider <provider>] [--investment-usd <amount>]
# 또는
mantle-cli lp analyze --token-a <token> --token-b <token> --fee-tier <tier> [--provider <provider>]
```

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--pool <address>` | V3 풀 주소 | |
| `--token-a <token>` | 첫 번째 토큰 심볼 또는 주소 | |
| `--token-b <token>` | 두 번째 토큰 심볼 또는 주소 | |
| `--fee-tier <tier>` | V3 수수료 등급 | |
| `--provider <provider>` | DEX 제공자: `agni` 또는 `fluxion` | `agni` |
| `--investment-usd <amount>` | 수익 예측을 위한 USD 금액 | `1000` |

---

## indexer

서브그래프 및 SQL 쿼리를 실행합니다.

```
mantle-cli indexer <subcommand>
```

### indexer subgraph

Mantle 인덱서에 GraphQL 쿼리를 실행합니다.

```bash
mantle-cli indexer subgraph --endpoint <url> --query <graphql> [--variables <json>] [--timeout <ms>]
```

| 옵션 | 설명 |
|------|------|
| `--endpoint <url>` | GraphQL 엔드포인트 URL |
| `--query <graphql>` | GraphQL 쿼리 |
| `--variables <json>` | GraphQL 변수 (JSON 문자열, 선택사항) |
| `--timeout <ms>` | 요청 타임아웃 (밀리초) |

### indexer sql

인덱서에 읽기 전용 SQL 쿼리를 실행합니다.

```bash
mantle-cli indexer sql --endpoint <url> --query <sql> [--params <json>] [--timeout <ms>]
```

| 옵션 | 설명 |
|------|------|
| `--endpoint <url>` | SQL 인덱서 엔드포인트 URL |
| `--query <sql>` | 읽기 전용 SQL 쿼리 |
| `--params <json>` | 쿼리 파라미터 (JSON 문자열, 선택사항) |
| `--timeout <ms>` | 요청 타임아웃 (밀리초) |

---

## diagnostics

RPC 상태를 확인하고 프로빙합니다.

```
mantle-cli diagnostics <subcommand>
```

### diagnostics rpc-health

RPC 엔드포인트 상태 및 chain-id 일관성을 확인합니다.

```bash
mantle-cli diagnostics rpc-health [--rpc-url <url>]
```

| 옵션 | 설명 |
|------|------|
| `--rpc-url <url>` | 테스트할 RPC URL (기본: 설정된 엔드포인트) |

### diagnostics probe

최소한의 메서드 호출로 JSON-RPC 엔드포인트를 프로빙합니다.

```bash
mantle-cli diagnostics probe --rpc-url <url> [--method <method>] [--params <json>]
```

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--rpc-url <url>` | 프로빙할 RPC 엔드포인트 | |
| `--method <method>` | RPC 메서드 (`eth_chainId`, `eth_blockNumber`, `eth_getBalance`) | `eth_blockNumber` |
| `--params <json>` | 메서드 파라미터 (JSON 배열, 선택사항) | |

---

## catalog

사용 가능한 도구와 기능을 탐색합니다.

```
mantle-cli catalog <subcommand>
```

### catalog list

카테고리, 인증 요구사항, 요약과 함께 모든 기능을 나열합니다.

```bash
mantle-cli catalog list [--category <cat>] [--auth <auth>]
```

| 옵션 | 설명 |
|------|------|
| `--category <cat>` | 카테고리 필터: `query`, `analyze`, `execute` |
| `--auth <auth>` | 인증 요구사항 필터: `none`, `optional`, `required` |

### catalog search

키워드로 기능을 검색합니다 (id, name, summary, tags에서 매칭).

```bash
mantle-cli catalog search <keyword>
```

### catalog show

특정 도구 ID의 전체 상세 정보를 표시합니다.

```bash
mantle-cli catalog show <tool-id>
```

예: `mantle-cli catalog show mantle_buildSwap`

---

## utils

안전한 인코딩/디코딩 유틸리티. hex, wei, calldata 계산에 Python/JS 대신 사용하세요.

```
mantle-cli utils <subcommand>
```

### utils parse-units

소수 수량을 raw 정수(wei)로 변환합니다.

```bash
mantle-cli utils parse-units --amount <amount> [--decimals <n>]
```

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--amount <amount>` | 소수 수량 (예: `100`, `1.5`) | |
| `--decimals <n>` | 토큰 소수점 자릿수 | `18` |

### utils format-units

raw 정수(wei)를 소수 수량으로 변환합니다.

```bash
mantle-cli utils format-units --amount-raw <raw> [--decimals <n>]
```

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--amount-raw <raw>` | raw 정수 수량 (문자열) | |
| `--decimals <n>` | 토큰 소수점 자릿수 | `18` |

### utils encode-call

컨트랙트 함수 호출을 ABI 인코딩합니다. hex calldata를 반환합니다. 전용 CLI 명령어가 없는 경우에만 사용하세요.

```bash
mantle-cli utils encode-call --abi <abi> --function <name> --args <json> [--to <address>] [--value <hex>] [--chain-id <n>]
```

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--abi <abi>` | JSON 배열 또는 human-readable ABI | |
| `--function <name>` | 호출할 함수 이름 | |
| `--args <json>` | 함수 인수 (JSON 배열, 예: `["0xAddr", "1000"]`) | |
| `--to <address>` | 대상 컨트랙트 주소 (unsigned_tx 출력 포함) | |
| `--value <hex>` | hex 인코딩된 MNT 값 | `0x0` |
| `--chain-id <n>` | 체인 ID | `5000` |

### utils build-tx

raw calldata로 unsigned_tx를 생성합니다. 지원되지 않는 작업의 최종 단계.

```bash
mantle-cli utils build-tx --to <address> --data <hex> [--value <amount>] [--description <text>] [--chain-id <n>]
```

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--to <address>` | 대상 컨트랙트 또는 수신자 주소 | |
| `--data <hex>` | hex 인코딩된 calldata (encode-call 결과). 순수 MNT 전송은 `0x` | |
| `--value <amount>` | 전송할 MNT: 소수 (예: `0.5`) 또는 hex (예: `0x0`) | |
| `--description <text>` | 트랜잭션의 사람이 읽을 수 있는 설명 | |
| `--chain-id <n>` | 체인 ID | `5000` |
