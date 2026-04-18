---
name: agent-token
description: >-
  Use when the user wants to EXECUTE a blockchain signing operation
  (Solana or EVM transaction/message) or query their wallet address
  through the privy-proxy-server agent-token API.
  Do NOT trigger when the user is discussing code, debugging,
  writing signing logic with libraries like ethers.js/@solana/web3.js,
  or asking about signing concepts without intent to execute.
allowed-tools: Bash(bun *)
---

# Agent Token Skill

Sign blockchain transactions/messages and query wallet info via privy-proxy-server using an agent token.

Supported chains: Solana, EVM-compatible (Ethereum, Polygon, Arbitrum, Base, BSC, etc.)

## Prerequisites

- `bun` installed
- Config (first found wins):
  1. `$HOME/.openclaw/realclaw-config.json` — contains `baseUrl` and all wallet tokens
  2. Fallback: `${CLAUDE_SKILL_DIR}/scripts/config.json` (baseUrl) + `$HOME/.openclaw/agent_token` or `${CLAUDE_SKILL_DIR}/scripts/agent_token` (token)

## Commands

### Query wallet info

```bash
bun ${CLAUDE_SKILL_DIR}/scripts/agent-token.ts wallet-info          # all wallets
bun ${CLAUDE_SKILL_DIR}/scripts/agent-token.ts wallet-info solana   # solana only
bun ${CLAUDE_SKILL_DIR}/scripts/agent-token.ts wallet-info evm      # evm only
```

Response (single wallet → object, multiple wallets → array). `chainType` is `"solana"` or `"ethereum"` (covers all EVM chains):
```json
{ "walletAddress": "...", "chainType": "solana", "chainId": "...", "label": "...", "status": "active", "expiresAt": "..." }
```

### Sign Solana transaction

```bash
bun ${CLAUDE_SKILL_DIR}/scripts/agent-token.ts sign solana-transaction --transaction <base64>
```

With broadcast (always Solana mainnet):
```bash
bun ${CLAUDE_SKILL_DIR}/scripts/agent-token.ts sign solana-transaction \
  --transaction <base64> --broadcast
```

### Sign Solana message

```bash
bun ${CLAUDE_SKILL_DIR}/scripts/agent-token.ts sign solana-message --message <base64>
```

### Sign EVM transaction

```bash
bun ${CLAUDE_SKILL_DIR}/scripts/agent-token.ts sign evm-transaction \
  --caip2 eip155:1 --transaction '{"to":"0x...","value":"0x0","data":"0x..."}'
```

With broadcast:
```bash
bun ${CLAUDE_SKILL_DIR}/scripts/agent-token.ts sign evm-transaction \
  --caip2 eip155:1 --transaction '{"to":"0x...","value":"0x0"}' --broadcast
```

### Sign EVM typed data (EIP-712)

```bash
bun ${CLAUDE_SKILL_DIR}/scripts/agent-token.ts sign evm-typed-data \
  --caip2 eip155:1 --typed-data '{"types":{},"primaryType":"...","domain":{},"message":{}}'
```

### Sign EVM message

```bash
bun ${CLAUDE_SKILL_DIR}/scripts/agent-token.ts sign evm-message --message "Hello World"
```

With hex encoding:
```bash
bun ${CLAUDE_SKILL_DIR}/scripts/agent-token.ts sign evm-message --message 0xdeadbeef --encoding hex
```

## Parameter Reference

### Signing data parameters

| Parameter | Sign type | Required | Description |
|---|---|---|---|
| `--transaction <data>` | solana-transaction | **Yes** | Base64-encoded serialized Solana transaction |
| `--transaction <data>` | evm-transaction | **Yes** | EVM transaction object as JSON string, e.g. `'{"to":"0x...","value":"0x0"}'` |
| `--message <data>` | solana-message | **Yes** | Base64-encoded message |
| `--message <data>` | evm-message | **Yes** | Message text (UTF-8 by default) or 0x-prefixed hex bytes (with `--encoding hex`) |
| `--typed-data <json>` | evm-typed-data | **Yes** | EIP-712 typed data as JSON string with `types`, `primaryType`, `domain`, `message` |
| `--caip2 <chain-id>` | evm-transaction, evm-typed-data | **Yes** | CAIP-2 chain identifier, always required for EVM (e.g. `eip155:1`) |
| `--encoding <enc>` | evm-message | No | `utf-8` (default) or `hex` |

### Transaction broadcast parameters

| Parameter | Sign type | Description |
|---|---|---|
| `--broadcast` | solana-transaction, evm-transaction | **Whether to broadcast the signed transaction on-chain.** Without this flag: only signs and returns the signature, transaction is NOT sent to the network, no gas/SOL consumed. With this flag: signs and immediately broadcasts to the network, transaction will execute on-chain, gas/SOL will be consumed, **irreversible**. For Solana, broadcast always targets mainnet (`solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`). |

### Audit parameters

| Parameter | Description |
|---|---|
| `--address <addr>` | Wallet address. Required when multiple wallets of the same chain type exist in `realclaw-config.json`. |
| `--strategy-id <id>` | Strategy ID for audit tracking. Alphanumeric and underscore only, max 32 chars. |
| `--strategy-name <name>` | Strategy name for audit tracking. Max 128 chars. |

## CAIP-2 Chain Identifier Reference

CAIP-2 is a cross-chain identifier standard used by the `--caip2` parameter (EVM only):

- **EVM-compatible networks**: `eip155:<chain-id>` where `<chain-id>` is a decimal number:
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

## Response Format

- **wallet-info**: Returns wallet info (via `POST /agent-tokens/query-info`, public endpoint — no auth required, IP rate-limited). Single wallet returns an object; multiple wallets return an array.
- **sign endpoints**: Returns the Privy RPC `data` field as JSON. The response structure depends on the sign type and broadcast flag. Typical examples:

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

> Response field names are determined by Privy upstream and may vary. Always present the complete JSON response to the user rather than assuming specific field names.

## Error Handling

| HTTP Status | Meaning | How to respond |
|---|---|---|
| 401 | Agent token invalid or expired | Token has expired, user needs to obtain a new agent-token |
| 403 | Token/grant revoked or chain type mismatch | Insufficient permissions - check grant status or chain type match |
| 422 | Request parameter validation failed | Show the error message and help the user fix the request parameters |
| 429 | Rate limit exceeded | Rate limited, suggest retrying later |
| 502 | Privy upstream API error | Upstream service error, suggest retrying later |
| Timeout | Request exceeded 30s | Request timed out, possibly a network issue or server overload |

## Config

### `$HOME/.openclaw/realclaw-config.json` (preferred)

```json
{
  "baseUrl": "https://api2.sbu-test-5.bybit.com",
  "wallets": [
    { "address": "0x...", "token": "oc_at_...", "type": "evm" },
    { "address": "Hav...", "token": "oc_at_...", "type": "solana" }
  ]
}
```

| Field | Required | Description |
|---|---|---|
| `baseUrl` | **Yes** | Server base URL |
| `apiBasePath` | No | API path prefix (default: `/byreal/api/privy-proxy/v1`) |
| `wallets` | **Yes** | Array of wallet objects |
| `wallets[].address` | **Yes** | Wallet address |
| `wallets[].token` | **Yes** | Agent token for this wallet |
| `wallets[].type` | **Yes** | Chain type: `evm` or `solana` |

### `config.json` (fallback)

Only used when `realclaw-config.json` does not exist.

| Field | Required | Default | Description |
|---|---|---|---|
| `baseUrl` | **Yes** | — | Server base URL. With BGW: `https://api2.sbu-test-5.bybit.com`. Without BGW: `http://localhost:3000` |
| `apiBasePath` | No | `/byreal/api/privy-proxy/v1` | API path prefix. Override if BGW uses a different routing path |
