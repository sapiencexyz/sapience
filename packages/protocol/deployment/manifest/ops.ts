// ops.ts — operational helpers for an already-deployed bundle.
//
// Replaces every non-deploy/non-verify subcommand from the old deploy.sh:
//   status, mint, bridge-to, bridge-back, resolve, retry-pm, retry-sm,
//   test-ct-bridge, check-ct-resolution, check-bridge, check-bridge-back
//
// All subcommands take `--bundle <testnet|mainnet>` so they read the matching
// config.json + .env. The bundle is required — same rule as apply/verify.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Bundle } from "./schema.ts";
import { captureSpawn, type SpawnResult } from "./_shared/spawn.ts";
import {
  loadBundleEnv as sharedLoadBundleEnv,
  writeConfigKey as sharedWriteConfigKey,
} from "./_shared/env.ts";

// ---------- paths ----------

const HERE = dirname(fileURLToPath(import.meta.url));
const PROTOCOL_ROOT = resolve(HERE, "..", "..");

/** Bundle-scoped env loader bound to this package's PROTOCOL_ROOT. */
export function loadBundleEnv(bundle: Bundle): Promise<Record<string, string>> {
  return sharedLoadBundleEnv(PROTOCOL_ROOT, bundle);
}

/** Bundle-scoped config writer bound to this package's PROTOCOL_ROOT. */
export function writeConfigKey(
  bundle: Bundle,
  key: string,
  value: string,
): Promise<void> {
  return sharedWriteConfigKey(PROTOCOL_ROOT, bundle, key, value);
}

function requireEnv(env: Record<string, string>, ...keys: string[]): void {
  const missing = keys.filter((k) => !env[k]);
  if (missing.length > 0)
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
}

// ---------- forge / cast wrappers ----------

interface RunForgeArgs {
  script: string;
  rpcUrl: string;
  env: Record<string, string>;
  broadcast?: boolean;
}

async function runForgeScript(args: RunForgeArgs): Promise<SpawnResult> {
  const a = ["script", args.script, "--rpc-url", args.rpcUrl, "-vvvv"];
  if (args.broadcast !== false) a.push("--broadcast");
  return captureSpawn("forge", a, PROTOCOL_ROOT, args.env, true);
}

async function runCast(
  args: string[],
  env: Record<string, string>,
): Promise<SpawnResult> {
  return captureSpawn("cast", args, PROTOCOL_ROOT, env, false);
}

// ---------- parsing helpers ----------

export function extractAddress(
  stdout: string,
  keyPrefix: string,
): string | undefined {
  const escaped = keyPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `^\\s*${escaped}=?\\s*(0x[a-fA-F0-9]{40})\\s*$`,
    "m",
  );
  return stdout.match(re)?.[1];
}

export function extractBytes32(
  stdout: string,
  keyPrefix: string,
): string | undefined {
  const escaped = keyPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `^\\s*${escaped}=?\\s*(0x[a-fA-F0-9]{64})\\s*$`,
    "m",
  );
  return stdout.match(re)?.[1];
}

export function parseBridgeStatus(num: number | string): string {
  switch (String(num)) {
    case "0":
      return "PENDING";
    case "1":
      return "COMPLETED";
    case "2":
      return "REFUNDED";
    default:
      return `UNKNOWN(${num})`;
  }
}

// ---------- logging ----------

const COLORS = {
  reset: "\x1b[0m",
  red: "\x1b[0;31m",
  green: "\x1b[0;32m",
  yellow: "\x1b[1;33m",
  blue: "\x1b[0;34m",
};

function logInfo(msg: string): void {
  console.log(`${COLORS.blue}[INFO]${COLORS.reset} ${msg}`);
}
function logSuccess(msg: string): void {
  console.log(`${COLORS.green}[SUCCESS]${COLORS.reset} ${msg}`);
}
function logWarn(msg: string): void {
  console.log(`${COLORS.yellow}[WARN]${COLORS.reset} ${msg}`);
}
function logError(msg: string): void {
  console.error(`${COLORS.red}[ERROR]${COLORS.reset} ${msg}`);
}

function lzScanUrl(bundle: Bundle): string {
  return bundle === "testnet"
    ? "https://testnet.layerzeroscan.com/"
    : "https://layerzeroscan.com/";
}

// ---------- subcommand handlers ----------

interface SubcommandContext {
  bundle: Bundle;
  env: Record<string, string>;
}

async function cmdStatus(ctx: SubcommandContext): Promise<void> {
  requireEnv(ctx.env, "PM_NETWORK_RPC_URL", "SM_NETWORK_RPC_URL");
  logInfo("=== PM Network status ===");
  const pm = await runForgeScript({
    script: "src/scripts/CheckStatus_PMNetwork.s.sol:CheckStatus_PMNetwork",
    rpcUrl: ctx.env.PM_NETWORK_RPC_URL,
    env: ctx.env,
    broadcast: false,
  });
  if (pm.exitCode !== 0) throw new Error(`CheckStatus_PMNetwork failed`);

  logInfo("=== SM Network status ===");
  const sm = await runForgeScript({
    script: "src/scripts/CheckStatus_SMNetwork.s.sol:CheckStatus_SMNetwork",
    rpcUrl: ctx.env.SM_NETWORK_RPC_URL,
    env: ctx.env,
    broadcast: false,
  });
  if (sm.exitCode !== 0) throw new Error(`CheckStatus_SMNetwork failed`);
}

async function cmdMint(ctx: SubcommandContext): Promise<void> {
  requireEnv(
    ctx.env,
    "PM_NETWORK_RPC_URL",
    "PM_NETWORK_DEPLOYER_PRIVATE_KEY",
    "PREDICTION_MARKET_ADDRESS",
    "COLLATERAL_TOKEN_ADDRESS",
    "RESOLVER_ADDRESS",
    "PREDICTOR_PRIVATE_KEY",
    "COUNTERPARTY_PRIVATE_KEY",
  );
  logInfo("=== Mint position tokens ===");
  const res = await runForgeScript({
    script: "src/scripts/MintPositionTokens.s.sol:MintPositionTokens",
    rpcUrl: ctx.env.PM_NETWORK_RPC_URL,
    env: ctx.env,
  });
  if (res.exitCode !== 0) throw new Error(`MintPositionTokens failed`);

  const updates: Array<[string, string | undefined]> = [
    ["PREDICTION_ID", extractBytes32(res.stdout, "PREDICTION_ID")],
    [
      "PREDICTOR_TOKEN_ADDRESS",
      extractAddress(res.stdout, "PREDICTOR_TOKEN_ADDRESS"),
    ],
    [
      "COUNTERPARTY_TOKEN_ADDRESS",
      extractAddress(res.stdout, "COUNTERPARTY_TOKEN_ADDRESS"),
    ],
    ["PICK_CONFIG_ID", extractBytes32(res.stdout, "PICK_CONFIG_ID")],
    ["CONDITION_ID", extractBytes32(res.stdout, "CONDITION_ID")],
  ];
  for (const [key, value] of updates) {
    if (value) {
      await writeConfigKey(ctx.bundle, key, value);
      logInfo(`Updated ${key} = ${value}`);
    }
  }
  logSuccess("Position tokens minted");
}

async function cmdBridgeTo(ctx: SubcommandContext): Promise<void> {
  requireEnv(
    ctx.env,
    "PM_NETWORK_RPC_URL",
    "PM_NETWORK_BRIDGE_ADDRESS",
    "PREDICTOR_TOKEN_ADDRESS",
    "PREDICTOR_PRIVATE_KEY",
  );
  logInfo("=== Bridge to Remote (Ethereal -> Arbitrum) ===");
  const res = await runForgeScript({
    script: "src/scripts/TestBridgeToRemote.s.sol:TestBridgeToRemote",
    rpcUrl: ctx.env.PM_NETWORK_RPC_URL,
    env: ctx.env,
  });
  if (res.exitCode !== 0) throw new Error("TestBridgeToRemote failed");
  const bridgeId = extractBytes32(res.stdout, "BRIDGE_ID");
  if (bridgeId) {
    await writeConfigKey(ctx.bundle, "BRIDGE_ID", bridgeId);
    logInfo(`Updated BRIDGE_ID = ${bridgeId}`);
  }
  logSuccess(`Bridge initiated — track at ${lzScanUrl(ctx.bundle)}`);
}

async function cmdBridgeBack(ctx: SubcommandContext): Promise<void> {
  requireEnv(
    ctx.env,
    "SM_NETWORK_RPC_URL",
    "SM_NETWORK_BRIDGE_ADDRESS",
    "PREDICTOR_PRIVATE_KEY",
  );
  logInfo("=== Bridge back (Arbitrum -> Ethereal) ===");
  const res = await runForgeScript({
    script: "src/scripts/TestBridgeBack.s.sol:TestBridgeBack",
    rpcUrl: ctx.env.SM_NETWORK_RPC_URL,
    env: ctx.env,
  });
  if (res.exitCode !== 0) throw new Error("TestBridgeBack failed");
  const id = extractBytes32(res.stdout, "BRIDGE_BACK_ID");
  if (id) {
    await writeConfigKey(ctx.bundle, "BRIDGE_BACK_ID", id);
    logInfo(`Updated BRIDGE_BACK_ID = ${id}`);
  }
  logSuccess(`Bridge back initiated — track at ${lzScanUrl(ctx.bundle)}`);
}

async function cmdResolve(ctx: SubcommandContext): Promise<void> {
  requireEnv(
    ctx.env,
    "PM_NETWORK_RPC_URL",
    "PM_NETWORK_DEPLOYER_PRIVATE_KEY",
    "RESOLVER_ADDRESS",
    "CONDITION_ID",
  );
  const outcome = ctx.env.OUTCOME ?? "yes";
  logInfo(`=== Resolve prediction (outcome=${outcome}) ===`);
  const res = await runForgeScript({
    script: "src/scripts/ResolvePrediction.s.sol:ResolvePrediction",
    rpcUrl: ctx.env.PM_NETWORK_RPC_URL,
    env: { ...ctx.env, OUTCOME: outcome },
  });
  if (res.exitCode !== 0) throw new Error("ResolvePrediction failed");
  logSuccess("Prediction resolved");
}

async function cmdRetryPm(ctx: SubcommandContext): Promise<void> {
  requireEnv(
    ctx.env,
    "PM_NETWORK_RPC_URL",
    "PM_NETWORK_BRIDGE_ADDRESS",
    "PM_NETWORK_DEPLOYER_PRIVATE_KEY",
    "BRIDGE_ID",
  );
  logInfo("=== Retry bridge from PM Network ===");
  const res = await runForgeScript({
    script: "src/scripts/RetryBridgePM.s.sol:RetryBridgePM",
    rpcUrl: ctx.env.PM_NETWORK_RPC_URL,
    env: ctx.env,
  });
  if (res.exitCode !== 0) throw new Error("RetryBridgePM failed");
  logSuccess(`Retry initiated — track at ${lzScanUrl(ctx.bundle)}`);
}

async function cmdRetrySm(ctx: SubcommandContext): Promise<void> {
  requireEnv(
    ctx.env,
    "SM_NETWORK_RPC_URL",
    "SM_NETWORK_BRIDGE_ADDRESS",
    "SM_NETWORK_DEPLOYER_PRIVATE_KEY",
    "BRIDGE_BACK_ID",
  );
  logInfo("=== Retry bridge from SM Network ===");
  const res = await runForgeScript({
    script: "src/scripts/RetryBridgeSM.s.sol:RetryBridgeSM",
    rpcUrl: ctx.env.SM_NETWORK_RPC_URL,
    env: ctx.env,
  });
  if (res.exitCode !== 0) throw new Error("RetryBridgeSM failed");
  logSuccess(`Retry initiated — track at ${lzScanUrl(ctx.bundle)}`);
}

async function cmdTestCtBridge(ctx: SubcommandContext): Promise<void> {
  requireEnv(
    ctx.env,
    "POLYGON_RPC_URL",
    "POLYGON_DEPLOYER_PRIVATE_KEY",
    "CT_READER_ADDRESS",
    "CONDITION_ID",
  );
  logInfo("=== Test CT resolution (Polygon -> Ethereal) ===");
  const res = await runForgeScript({
    script: "src/scripts/TestCTResolverBridge.s.sol:TestCTResolverBridge",
    rpcUrl: ctx.env.POLYGON_RPC_URL,
    env: ctx.env,
  });
  if (res.exitCode !== 0) throw new Error("TestCTResolverBridge failed");
  logSuccess(`Resolution requested — track at ${lzScanUrl(ctx.bundle)}`);
  logInfo("After ~1-2 min, run: ops check-ct-resolution");
}

async function cmdCheckCtResolution(ctx: SubcommandContext): Promise<void> {
  requireEnv(
    ctx.env,
    "PM_NETWORK_RPC_URL",
    "CT_CONDITION_RESOLVER_ADDRESS",
    "CONDITION_ID",
  );
  logInfo("=== Check CT resolution on Ethereal ===");
  const res = await runForgeScript({
    script: "src/scripts/CheckCTResolution.s.sol:CheckCTResolution",
    rpcUrl: ctx.env.PM_NETWORK_RPC_URL,
    env: ctx.env,
    broadcast: false,
  });
  if (res.exitCode !== 0) throw new Error("CheckCTResolution failed");
}

interface BridgeStatusFields {
  token?: string;
  sender?: string;
  recipient?: string;
  amount?: string;
  status: string;
}

export function parseGetPendingBridgeOutput(
  raw: string,
): BridgeStatusFields {
  // Output looks like: "(0xToken, 0xSender, 0xRecipient, 1234, ts1, ts2, status)"
  const addrs = raw.match(/0x[a-fA-F0-9]{40}/g) ?? [];
  const ints = raw.match(/\b\d+\b/g) ?? [];
  const statusNum = ints.length > 0 ? ints[ints.length - 1] : undefined;
  return {
    token: addrs[0],
    sender: addrs[1],
    recipient: addrs[2],
    amount: ints[0],
    status: parseBridgeStatus(statusNum ?? "?"),
  };
}

async function castGetPendingBridge(
  bridgeAddr: string,
  rpcUrl: string,
  bridgeId: string,
  env: Record<string, string>,
): Promise<BridgeStatusFields> {
  const res = await runCast(
    [
      "call",
      bridgeAddr,
      "getPendingBridge(bytes32)((address,address,address,uint256,uint64,uint64,uint8))",
      bridgeId,
      "--rpc-url",
      rpcUrl,
    ],
    env,
  );
  if (res.exitCode !== 0)
    throw new Error(`cast call failed: ${res.stderr.slice(0, 200)}`);
  return parseGetPendingBridgeOutput(res.stdout);
}

function printBridgeStatus(side: "PM" | "SM", fields: BridgeStatusFields): void {
  console.log("========================================");
  console.log(`  Bridge status (${side} Network)`);
  console.log("========================================");
  console.log(`Token:     ${fields.token ?? "—"}`);
  console.log(`Sender:    ${fields.sender ?? "—"}`);
  console.log(`Recipient: ${fields.recipient ?? "—"}`);
  console.log(`Amount:    ${fields.amount ?? "—"}`);
  console.log(`Status:    ${fields.status}`);
  console.log("========================================");

  if (fields.status === "PENDING")
    logWarn("Bridge is PENDING — waiting for LayerZero delivery or needs retry");
  else if (fields.status === "COMPLETED") logSuccess("Bridge is COMPLETED");
}

async function cmdCheckBridge(ctx: SubcommandContext): Promise<void> {
  requireEnv(
    ctx.env,
    "PM_NETWORK_RPC_URL",
    "PM_NETWORK_BRIDGE_ADDRESS",
    "BRIDGE_ID",
  );
  logInfo("=== Check bridge status (PM) ===");
  const fields = await castGetPendingBridge(
    ctx.env.PM_NETWORK_BRIDGE_ADDRESS,
    ctx.env.PM_NETWORK_RPC_URL,
    ctx.env.BRIDGE_ID,
    ctx.env,
  );
  printBridgeStatus("PM", fields);
}

async function cmdCheckBridgeBack(ctx: SubcommandContext): Promise<void> {
  requireEnv(
    ctx.env,
    "SM_NETWORK_RPC_URL",
    "SM_NETWORK_BRIDGE_ADDRESS",
    "BRIDGE_BACK_ID",
  );
  logInfo("=== Check bridge-back status (SM) ===");
  const fields = await castGetPendingBridge(
    ctx.env.SM_NETWORK_BRIDGE_ADDRESS,
    ctx.env.SM_NETWORK_RPC_URL,
    ctx.env.BRIDGE_BACK_ID,
    ctx.env,
  );
  printBridgeStatus("SM", fields);
}

// ---------- subcommand dispatch ----------

type Handler = (ctx: SubcommandContext) => Promise<void>;

const HANDLERS: Record<string, { run: Handler; help: string }> = {
  status: {
    run: cmdStatus,
    help: "Run CheckStatus_PMNetwork + _SMNetwork forge scripts.",
  },
  mint: {
    run: cmdMint,
    help: "Mint position tokens. Reads PREDICTOR_PRIVATE_KEY + COUNTERPARTY_PRIVATE_KEY.",
  },
  "bridge-to": {
    run: cmdBridgeTo,
    help: "Bridge tokens Ethereal -> Arbitrum (test). Writes BRIDGE_ID back to config.json.",
  },
  "bridge-back": {
    run: cmdBridgeBack,
    help: "Bridge tokens Arbitrum -> Ethereal (test). Writes BRIDGE_BACK_ID.",
  },
  resolve: {
    run: cmdResolve,
    help: "Resolve a prediction. Pass OUTCOME=yes|no|tie (default yes).",
  },
  "retry-pm": {
    run: cmdRetryPm,
    help: "Retry a stuck bridge from PM Network. Needs BRIDGE_ID.",
  },
  "retry-sm": {
    run: cmdRetrySm,
    help: "Retry a stuck bridge from SM Network. Needs BRIDGE_BACK_ID.",
  },
  "test-ct-bridge": {
    run: cmdTestCtBridge,
    help: "Request CT resolution from Polygon. Needs CONDITION_ID.",
  },
  "check-ct-resolution": {
    run: cmdCheckCtResolution,
    help: "Check if a CT resolution arrived on Ethereal. Needs CONDITION_ID.",
  },
  "check-bridge": {
    run: cmdCheckBridge,
    help: "Inspect a pending bridge on PM Network via cast call. Needs BRIDGE_ID.",
  },
  "check-bridge-back": {
    run: cmdCheckBridgeBack,
    help: "Inspect a pending bridge on SM Network via cast call. Needs BRIDGE_BACK_ID.",
  },
};

// ---------- CLI ----------

interface CliOptions {
  subcommand?: string;
  bundle?: Bundle;
  rest: string[];
}

export function parseCliArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    if (a === "--bundle") {
      const v = argv[++i];
      if (v !== "testnet" && v !== "mainnet")
        throw new Error(`--bundle must be "testnet" or "mainnet", got "${v}"`);
      opts.bundle = v;
    } else if (a === "--help" || a === "-h") {
      // Help handled at top level (needs subcommand list).
      opts.rest.push(a);
    } else if (!opts.subcommand && !a.startsWith("--")) {
      opts.subcommand = a;
    } else {
      opts.rest.push(a);
    }
  }
  return opts;
}

function printHelp(): void {
  console.log(`Usage: ops <subcommand> --bundle <testnet|mainnet>

Operational helpers for an already-deployed bundle. Every subcommand reads
deployment/<bundle>/{config.json,.env} for addresses + secrets and falls
through to the appropriate forge or cast invocation.

Subcommands:`);
  for (const [name, { help }] of Object.entries(HANDLERS)) {
    console.log(`  ${name.padEnd(22)}${help}`);
  }
  console.log(`
Examples:
  ops status --bundle testnet
  OUTCOME=no ops resolve --bundle testnet
  BRIDGE_ID=0x… ops check-bridge --bundle mainnet
`);
}

async function runCli(): Promise<void> {
  const opts = parseCliArgs(process.argv.slice(2));

  if (opts.rest.includes("--help") || opts.rest.includes("-h") || !opts.subcommand) {
    printHelp();
    process.exit(opts.subcommand ? 0 : 1);
  }

  if (!opts.bundle)
    throw new Error(
      "--bundle <testnet|mainnet> is required (ops never operates across both bundles)",
    );

  const handler = HANDLERS[opts.subcommand];
  if (!handler) {
    logError(`Unknown subcommand: ${opts.subcommand}`);
    printHelp();
    process.exit(1);
  }

  const env = await loadBundleEnv(opts.bundle);
  await handler.run({ bundle: opts.bundle, env });
}

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("ops.ts");

if (isMain) {
  runCli().catch((err) => {
    logError(err.stack ?? err.message ?? String(err));
    process.exit(1);
  });
}
