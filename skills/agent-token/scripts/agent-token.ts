import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";

const SCRIPT_DIR = dirname(Bun.main);
const DEFAULT_API_BASE_PATH = "/byreal/api/privy-proxy/v1";
const TIMEOUT_MS = 30_000;

const VALID_SIGN_TYPES = [
  "solana-transaction",
  "solana-message",
  "evm-transaction",
  "evm-typed-data",
  "evm-message",
] as const;
type SignType = (typeof VALID_SIGN_TYPES)[number];

// --- Help ---

const HELP_TEXT = `agent-token - Privy Proxy Server signing tool

Usage:
  bun agent-token.ts <command> [options]

Commands:
  wallet-info [solana|evm]         Query wallet info (all, solana only, or evm only)
  sign <type> [options]           Sign a transaction or message

Sign types:
  solana-transaction              Sign (or sign & broadcast) a Solana transaction
  solana-message                  Sign a Solana message
  evm-transaction                 Sign (or sign & broadcast) an EVM transaction
  evm-typed-data                  Sign EIP-712 typed data
  evm-message                     Sign an EVM personal message

Global options:
  --help                          Show this help message

Sign options (varies by type):
  --transaction <data>            Transaction data (base64 for Solana, JSON string for EVM)
  --message <data>                Message to sign (base64 for Solana, string for EVM)
  --typed-data <json>             EIP-712 typed data (JSON string)
  --caip2 <chain-id>              CAIP-2 chain identifier for EVM (e.g. eip155:1)
  --broadcast                     Broadcast after signing (flag, default: false)
  --encoding <utf-8|hex>          Message encoding (evm-message only, default: utf-8)
  --address <addr>                Wallet address (when multiple wallets of same chain type)
  --strategy-id <id>              Strategy ID for audit tracking
  --strategy-name <name>          Strategy name for audit tracking

Config & token resolution (first found wins):
  1. $HOME/.openclaw/realclaw-config.json  (baseUrl + wallets with tokens)
  2. Fallback: <script-dir>/config.json (baseUrl) + $HOME/.openclaw/agent_token (token)`;

// --- Arg parsing ---

interface ParsedArgs {
  command: string;
  signType?: string;
  flags: Set<string>;
  options: Map<string, string>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2); // skip bun and script path
  const flags = new Set<string>();
  const options = new Map<string, string>();
  const positional: string[] = [];

  const FLAG_ONLY = new Set(["--help", "--broadcast"]);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (FLAG_ONLY.has(arg)) {
      flags.add(arg);
    } else if (arg.startsWith("--")) {
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) {
        error(`Missing value for ${arg}`);
      }
      options.set(arg, next);
      i++;
    } else {
      positional.push(arg);
    }
  }

  return {
    command: positional[0] ?? "",
    signType: positional[1],
    flags,
    options,
  };
}

function getRequired(options: Map<string, string>, key: string): string {
  const val = options.get(key);
  if (val === undefined) {
    error(`Missing required parameter: ${key}`);
  }
  return val;
}

// --- Config loading ---

interface Config {
  baseUrl: string;
  apiBasePath: string;
}

interface Wallet {
  address: string;
  token: string;
  type: string; // "evm" | "solana" | "" (fallback)
}

// --- Config & token loading ---

function loadAll(): { config: Config; wallets: Wallet[] } {
  // Priority 1: $HOME/.openclaw/realclaw-config.json
  const realclawPath = resolve(
    process.env.HOME ?? "",
    ".openclaw",
    "realclaw-config.json"
  );

  if (existsSync(realclawPath)) {
    const raw = readFileSync(realclawPath, "utf-8");
    const data = JSON.parse(raw);
    if (!data.baseUrl || typeof data.baseUrl !== "string") {
      error(
        `Invalid realclaw-config.json: "baseUrl" must be a non-empty string`
      );
    }
    if (!Array.isArray(data.wallets) || data.wallets.length === 0) {
      error(
        `Invalid realclaw-config.json: "wallets" must be a non-empty array`
      );
    }
    const wallets: Wallet[] = data.wallets.map(
      (w: Record<string, unknown>) => {
        if (!w.address || !w.token || !w.type) {
          error(
            `Invalid wallet in realclaw-config.json: each wallet must have address, token, and type`
          );
        }
        return {
          address: w.address as string,
          token: w.token as string,
          type: w.type as string,
        };
      }
    );
    return {
      config: {
        baseUrl: data.baseUrl,
        apiBasePath: data.apiBasePath ?? DEFAULT_API_BASE_PATH,
      },
      wallets,
    };
  }

  // Priority 2 fallback: config.json + agent_token file
  const configPath = resolve(SCRIPT_DIR, "config.json");
  if (!existsSync(configPath)) {
    error(
      `Config not found. Provide either:\n  1. $HOME/.openclaw/realclaw-config.json\n  2. ${SCRIPT_DIR}/config.json`
    );
  }
  const raw = readFileSync(configPath, "utf-8");
  const configData = JSON.parse(raw);
  if (!configData.baseUrl || typeof configData.baseUrl !== "string") {
    error(`Invalid config.json: "baseUrl" must be a non-empty string`);
  }
  const config: Config = {
    baseUrl: configData.baseUrl,
    apiBasePath: configData.apiBasePath ?? DEFAULT_API_BASE_PATH,
  };

  const tokenCandidates = [
    resolve(process.env.HOME ?? "", ".openclaw", "agent_token"),
    resolve(SCRIPT_DIR, "agent_token"),
  ];
  for (const path of tokenCandidates) {
    if (existsSync(path)) {
      const content = readFileSync(path, "utf-8").trim();
      if (content.length > 0) {
        return { config, wallets: [{ address: "", token: content, type: "" }] };
      }
    }
  }

  error(
    `Agent token not found. Searched:\n  1. $HOME/.openclaw/agent_token\n  2. ${SCRIPT_DIR}/agent_token`
  );
}

// --- HTTP ---

async function request(
  config: Config,
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
  authToken?: string
): Promise<unknown> {
  const url = `${config.baseUrl.replace(/\/+$/, "")}${config.apiBasePath}${path}`;
  const headers: Record<string, string> = {};
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  const init: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      error(`Request timed out after ${TIMEOUT_MS / 1000}s: ${method} ${url}`);
    }
    error(`Network error: ${e instanceof Error ? e.message : String(e)}`);
  }

  const text = await res.text();
  if (!res.ok) {
    console.error(`HTTP ${res.status} ${res.statusText}`);
    console.error(text);
    process.exit(1);
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// --- Sign body builders ---

function buildSignBody(
  signType: SignType,
  args: ParsedArgs
): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  // strategy fields (common to all)
  const strategyId = args.options.get("--strategy-id");
  const strategyName = args.options.get("--strategy-name");
  if (strategyId !== undefined) body.strategyId = strategyId;
  if (strategyName !== undefined) body.strategyName = strategyName;

  switch (signType) {
    case "solana-transaction": {
      body.transaction = getRequired(args.options, "--transaction");
      if (args.flags.has("--broadcast")) {
        body.broadcast = true;
        body.caip2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
      }
      break;
    }
    case "solana-message": {
      body.message = getRequired(args.options, "--message");
      break;
    }
    case "evm-transaction": {
      body.caip2 = getRequired(args.options, "--caip2");
      const txRaw = getRequired(args.options, "--transaction");
      try {
        body.transaction = JSON.parse(txRaw);
      } catch {
        error(
          `Invalid JSON for --transaction: ${txRaw}\nProvide a valid JSON string, e.g. '{"to":"0x...","value":"0x0"}'`
        );
      }
      if (args.flags.has("--broadcast")) {
        body.broadcast = true;
      }
      break;
    }
    case "evm-typed-data": {
      body.caip2 = getRequired(args.options, "--caip2");
      const tdRaw = getRequired(args.options, "--typed-data");
      try {
        body.typedData = JSON.parse(tdRaw);
      } catch {
        error(`Invalid JSON for --typed-data: ${tdRaw}`);
      }
      break;
    }
    case "evm-message": {
      body.message = getRequired(args.options, "--message");
      const encoding = args.options.get("--encoding");
      if (encoding !== undefined) body.encoding = encoding;
      break;
    }
  }

  return body;
}

// --- Wallet selection ---

function resolveWalletForSign(
  wallets: Wallet[],
  signType: SignType,
  address?: string
): Wallet {
  // Single wallet (including fallback mode): use it directly
  if (wallets.length === 1) return wallets[0];

  const chainType = signType.startsWith("solana") ? "solana" : "evm";
  const matches = wallets.filter((w) => w.type === chainType);

  if (matches.length === 0) {
    error(`No ${chainType} wallet found in config`);
  }

  if (address) {
    const found = matches.find(
      (w) => w.address.toLowerCase() === address.toLowerCase()
    );
    if (!found) {
      error(
        `No ${chainType} wallet with address ${address}\nAvailable:\n${matches.map((w) => `  ${w.address}`).join("\n")}`
      );
    }
    return found;
  }

  if (matches.length > 1) {
    error(
      `Multiple ${chainType} wallets found. Use --address to specify:\n${matches.map((w) => `  ${w.address}`).join("\n")}`
    );
  }

  return matches[0];
}

// --- Helpers ---

function error(msg: string): never {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

// --- Main ---

async function main() {
  const args = parseArgs(process.argv);

  if (args.flags.has("--help") || args.command === "") {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  // Validate command and sign type before loading config/token
  if (args.command !== "wallet-info" && args.command !== "sign") {
    error(
      `Unknown command: "${args.command}"\nValid commands: wallet-info, sign`
    );
  }
  if (args.command === "wallet-info") {
    const filter = args.signType;
    if (filter && filter !== "solana" && filter !== "evm") {
      error(
        `Invalid wallet-info filter: "${filter}"\nValid filters: solana, evm (or omit for all)`
      );
    }
  }
  if (args.command === "sign") {
    if (
      !args.signType ||
      !VALID_SIGN_TYPES.includes(args.signType as SignType)
    ) {
      error(
        `Invalid sign type: "${args.signType ?? ""}"\nValid types: ${VALID_SIGN_TYPES.join(", ")}`
      );
    }
  }

  const { config, wallets } = loadAll();

  switch (args.command) {
    case "wallet-info": {
      // query-info is a public endpoint — no Authorization header needed
      const filter = args.signType as "solana" | "evm" | undefined;
      const isFallback = wallets.length === 1 && wallets[0].type === "";
      const filtered =
        filter && !isFallback
          ? wallets.filter((w) => w.type === filter)
          : wallets;
      if (filtered.length === 0) {
        error(`No ${filter} wallet found in config`);
      }
      const tokens = filtered.map((w) => w.token);
      const resp = (await request(
        config,
        "POST",
        "/agent-tokens/query-info",
        { tokens }
      )) as { data?: { tokens?: Array<Record<string, unknown>> } };
      const tokenInfos = resp.data?.tokens;
      if (tokenInfos && tokenInfos.length > 0) {
        const result = tokenInfos.map((info) => ({
          walletAddress: info.walletAddress,
          chainType: info.chainType,
          chainId: info.chainId,
          label: info.label,
          status: info.status,
          expiresAt: info.expiresAt,
        }));
        console.log(
          JSON.stringify(result.length === 1 ? result[0] : result, null, 2)
        );
      } else {
        console.log(JSON.stringify(resp, null, 2));
      }
      break;
    }
    case "sign": {
      const signType = args.signType as SignType;
      const wallet = resolveWalletForSign(
        wallets,
        signType,
        args.options.get("--address")
      );
      const body = buildSignBody(signType, args);
      const data = await request(
        config,
        "POST",
        `/sign/${signType}`,
        body,
        wallet.token
      );
      const resp = data as { data?: unknown };
      console.log(JSON.stringify(resp.data ?? data, null, 2));
      break;
    }
  }
}

main();
