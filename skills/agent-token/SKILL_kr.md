---
name: agent-token
description: >-
  사용자가 블록체인 서명 작업(Solana 또는 EVM 트랜잭션/메시지)을 실행하거나
  privy-proxy-server agent-token API를 통해 지갑 주소를 조회하려 할 때 사용합니다.
  사용자가 코드를 작성하거나, ethers.js/@solana/web3.js 같은 라이브러리로 서명 로직을
  디버깅하거나, 실행 의도 없이 서명 개념을 논의할 때는 사용하지 않습니다.
allowed-tools: Bash(bun *)
---

# Agent Token 스킬

privy-proxy-server를 통해 agent token으로 블록체인 트랜잭션/메시지를 서명하고 지갑 정보를 조회합니다.

지원 체인: Solana, EVM 호환 체인 (Ethereum, Polygon, Arbitrum, Base, BSC 등)

## 사전 조건

- `bun` 설치 필요
- 설정 파일 (아래 순서에서 먼저 발견된 것을 사용):
  1. `$HOME/.openclaw/realclaw-config.json` — `baseUrl`과 모든 지갑 토큰 포함
  2. 폴백: `${CLAUDE_SKILL_DIR}/scripts/config.json` (baseUrl) + `$HOME/.openclaw/agent_token` 또는 `${CLAUDE_SKILL_DIR}/scripts/agent_token` (토큰)

## 명령어

### 지갑 정보 조회

```bash
bun ${CLAUDE_SKILL_DIR}/scripts/agent-token.ts wallet-info          # 전체 지갑
bun ${CLAUDE_SKILL_DIR}/scripts/agent-token.ts wallet-info solana   # Solana만
bun ${CLAUDE_SKILL_DIR}/scripts/agent-token.ts wallet-info evm      # EVM만
```

응답 (지갑 1개 → 객체, 여러 개 → 배열). `chainType`은 `"solana"` 또는 `"ethereum"` (모든 EVM 체인 포함):

```json
{
  "walletAddress": "...",
  "chainType": "solana",
  "chainId": "...",
  "label": "...",
  "status": "active",
  "expiresAt": "..."
}
```

### Solana 트랜잭션 서명

```bash
bun ${CLAUDE_SKILL_DIR}/scripts/agent-token.ts sign solana-transaction --transaction <base64>
```

브로드캐스트 포함 (항상 Solana mainnet):

```bash
bun ${CLAUDE_SKILL_DIR}/scripts/agent-token.ts sign solana-transaction \
  --transaction <base64> --broadcast
```

### Solana 메시지 서명

```bash
bun ${CLAUDE_SKILL_DIR}/scripts/agent-token.ts sign solana-message --message <base64>
```

### EVM 트랜잭션 서명

```bash
bun ${CLAUDE_SKILL_DIR}/scripts/agent-token.ts sign evm-transaction \
  --caip2 eip155:1 --transaction '{"to":"0x...","value":"0x0","data":"0x..."}'
```

브로드캐스트 포함:

```bash
bun ${CLAUDE_SKILL_DIR}/scripts/agent-token.ts sign evm-transaction \
  --caip2 eip155:1 --transaction '{"to":"0x...","value":"0x0"}' --broadcast
```

### EVM typed data 서명 (EIP-712)

```bash
bun ${CLAUDE_SKILL_DIR}/scripts/agent-token.ts sign evm-typed-data \
  --caip2 eip155:1 --typed-data '{"types":{},"primaryType":"...","domain":{},"message":{}}'
```

### EVM 메시지 서명

```bash
bun ${CLAUDE_SKILL_DIR}/scripts/agent-token.ts sign evm-message --message "Hello World"
```

hex 인코딩:

```bash
bun ${CLAUDE_SKILL_DIR}/scripts/agent-token.ts sign evm-message --message 0xdeadbeef --encoding hex
```

## 파라미터 레퍼런스

### 서명 데이터 파라미터

| 파라미터               | 서명 타입                       | 필수     | 설명                                                                                |
| ---------------------- | ------------------------------- | -------- | ----------------------------------------------------------------------------------- |
| `--transaction <data>` | solana-transaction              | **필수** | Base64 인코딩된 직렬화된 Solana 트랜잭션                                            |
| `--transaction <data>` | evm-transaction                 | **필수** | JSON 문자열 형태의 EVM 트랜잭션 객체, 예: `'{"to":"0x...","value":"0x0"}'`          |
| `--message <data>`     | solana-message                  | **필수** | Base64 인코딩된 메시지                                                              |
| `--message <data>`     | evm-message                     | **필수** | 메시지 텍스트 (기본 UTF-8) 또는 0x 접두사 hex 바이트 (`--encoding hex` 사용 시)     |
| `--typed-data <json>`  | evm-typed-data                  | **필수** | `types`, `primaryType`, `domain`, `message`를 포함한 EIP-712 typed data JSON 문자열 |
| `--caip2 <chain-id>`   | evm-transaction, evm-typed-data | **필수** | CAIP-2 체인 식별자, EVM에서 항상 필요 (예: `eip155:1`)                              |
| `--encoding <enc>`     | evm-message                     | 선택     | `utf-8` (기본값) 또는 `hex`                                                         |

### 트랜잭션 브로드캐스트 파라미터

| 파라미터      | 서명 타입                           | 설명                                                                                                                                                                                                                                                                                                                                                                         |
| ------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--broadcast` | solana-transaction, evm-transaction | **온체인에 서명된 트랜잭션을 브로드캐스트할지 여부.** 플래그 없음: 서명만 하고 서명값 반환, 트랜잭션은 네트워크에 전송되지 않으며 gas/SOL 소비 없음. 플래그 있음: 서명 후 즉시 네트워크에 브로드캐스트, 트랜잭션이 온체인에서 실행되며 gas/SOL 소비, **되돌릴 수 없음**. Solana의 경우 브로드캐스트는 항상 mainnet(`solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`)을 대상으로 함. |

### 감사 추적 파라미터

| 파라미터                 | 설명                                                                             |
| ------------------------ | -------------------------------------------------------------------------------- |
| `--address <addr>`       | 지갑 주소. `realclaw-config.json`에 동일 체인 타입의 지갑이 여러 개인 경우 필수. |
| `--strategy-id <id>`     | 감사 추적용 전략 ID. 영숫자 및 밑줄만 허용, 최대 32자.                           |
| `--strategy-name <name>` | 감사 추적용 전략 이름. 최대 128자.                                               |

## CAIP-2 체인 식별자 레퍼런스

CAIP-2는 `--caip2` 파라미터에서 사용하는 크로스체인 식별자 표준입니다 (EVM 전용):

- **EVM 호환 네트워크**: `eip155:<chain-id>` 형식 (chain-id는 십진수):
  - Ethereum: `eip155:1`
  - Polygon: `eip155:137`
  - Arbitrum One: `eip155:42161`
  - Base: `eip155:8453`
  - BSC (BNB Chain): `eip155:56`
  - Optimism: `eip155:10`
  - Avalanche C-Chain: `eip155:43114`
  - Mantle: `eip155:5000`
  - Fantom: `eip155:250`
  - Gnosis: `eip155:100`
  - zkSync Era: `eip155:324`
  - Linea: `eip155:59144`
  - Scroll: `eip155:534352`
  - Celo: `eip155:42220`
  - Moonbeam: `eip155:1284`

## 응답 형식

- **wallet-info**: 지갑 정보 반환 (`POST /agent-tokens/query-info`, 공개 엔드포인트 — 인증 불필요, IP 레이트 리밋 적용). 지갑 1개는 객체, 여러 개는 배열로 반환.
- **sign 엔드포인트**: Privy RPC `data` 필드를 JSON으로 반환. 응답 구조는 서명 타입과 broadcast 여부에 따라 다름. 일반적인 예시:

```jsonc
// solana-transaction (broadcast=false)
{ "signedTransaction": "base64..." }

// solana-transaction (broadcast=true)
{ "hash": "5Uz5...txHash" }

// solana-message
{ "signature": "base64..." }

// evm-transaction (broadcast=false)
{ "signedTransaction": "0xf86c..." }

// evm-transaction (broadcast=true)
{ "hash": "0xabc123..." }

// evm-typed-data, evm-message
{ "signature": "0x..." }
```

> 응답 필드명은 Privy upstream에서 결정되며 변경될 수 있습니다. 특정 필드명을 가정하지 말고 전체 JSON 응답을 그대로 사용자에게 전달하세요.

## 오류 처리

| HTTP 상태 | 의미                                 | 대응                                                       |
| --------- | ------------------------------------ | ---------------------------------------------------------- |
| 401       | agent token이 유효하지 않거나 만료됨 | 토큰 만료 — 사용자가 새 agent-token을 발급받아야 함        |
| 403       | 토큰/권한 취소 또는 체인 타입 불일치 | 권한 부족 — grant 상태 또는 체인 타입 일치 여부 확인       |
| 422       | 요청 파라미터 유효성 검사 실패       | 오류 메시지를 확인하고 사용자가 파라미터를 수정하도록 안내 |
| 429       | 레이트 리밋 초과                     | 레이트 리밋 — 잠시 후 재시도 권장                          |
| 502       | Privy upstream API 오류              | 업스트림 서비스 오류 — 잠시 후 재시도 권장                 |
| Timeout   | 요청이 30초 초과                     | 요청 타임아웃 — 네트워크 문제 또는 서버 과부하 가능성      |

## 설정

### `$HOME/.openclaw/realclaw-config.json` (권장)

```json
{
  "baseUrl": "https://api2.sbu-test-5.bybit.com",
  "wallets": [
    { "address": "0x...", "token": "oc_at_...", "type": "evm" },
    { "address": "Hav...", "token": "oc_at_...", "type": "solana" }
  ]
}
```

| 필드                | 필수     | 설명                                                   |
| ------------------- | -------- | ------------------------------------------------------ |
| `baseUrl`           | **필수** | 서버 기본 URL                                          |
| `apiBasePath`       | 선택     | API 경로 접두사 (기본값: `/byreal/api/privy-proxy/v1`) |
| `wallets`           | **필수** | 지갑 객체 배열                                         |
| `wallets[].address` | **필수** | 지갑 주소                                              |
| `wallets[].token`   | **필수** | 해당 지갑의 agent token                                |
| `wallets[].type`    | **필수** | 체인 타입: `evm` 또는 `solana`                         |

### `config.json` (폴백)

`realclaw-config.json`이 없을 때만 사용됩니다.

| 필드          | 필수     | 기본값                       | 설명                                                                                                    |
| ------------- | -------- | ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| `baseUrl`     | **필수** | —                            | 서버 기본 URL. BGW 사용 시: `https://api2.sbu-test-5.bybit.com`. BGW 미사용 시: `http://localhost:3000` |
| `apiBasePath` | 선택     | `/byreal/api/privy-proxy/v1` | API 경로 접두사. BGW가 다른 라우팅 경로를 사용하는 경우 재정의                                          |
