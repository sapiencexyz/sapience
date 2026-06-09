// apply.ts — Phase 3 executor.
//
// Walks a Plan (from plan.ts) in order, invokes forge for each item, parses
// the produced address(es) from stdout, and persists the new state to BOTH
// the manifest (state.address, state.bytecodeHash, …) and `<bundle>/config.json`
// (so the rest of deploy.sh keeps working).
//
// Side-effecting code is isolated behind an injectable `ApplyDeps` shape so
// tests can stub forge, the filesystem, and the wall clock.

import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ENV_NAMES,
  isEnvName,
  type EnvName,
  type Manifest,
  type VerifierConfig,
} from "./schema.ts";
import { readArtifactHashes } from "./populate.ts";
import { generateSdkAddresses } from "./sync-sdk.ts";
import {
  computePlan,
  loadAllManifests,
  readCurrentHashes,
  type ConfigureItem,
  type DeployItem,
  type Plan,
  type PlanItem,
} from "./plan.ts";
import {
  captureSpawn,
  castDeriveAddress,
  castGetBlockNumber,
  castKeccak256,
  forgeBuild,
  readGitSha,
} from "./_shared/spawn.ts";
import { loadConfigJson, loadEnvFile } from "./_shared/env.ts";

// ---------- paths (CLI use only) ----------

const HERE = dirname(fileURLToPath(import.meta.url));
const PROTOCOL_ROOT = resolve(HERE, "..", "..");
const MANIFEST_DIR = resolve(HERE, "env");

// ---------- types ----------

export interface ForgeInvocation {
  /** Forge script identifier, e.g. "src/scripts/DeployFactory.s.sol:DeployFactory". */
  script: string;
  /** Working directory for the spawned process (packages/protocol). */
  cwd: string;
  /** RPC endpoint URL. */
  rpcUrl: string;
  /** Deployer private key (0x-prefixed). */
  privateKey: string;
  /** Extra env vars passed to the forge subprocess. */
  env: Record<string, string>;
  /** When true, pass --broadcast; otherwise it's a simulation. */
  broadcast: boolean;
  /** Extra forge args (e.g. --verify --verifier blockscout …) appended verbatim. */
  extraArgs?: string[];
}

export interface ForgeResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type ForgeRunner = (inv: ForgeInvocation) => Promise<ForgeResult>;

export interface ApplyItemResult {
  item: PlanItem;
  status: "success" | "failure" | "skipped-dry-run" | "simulated";
  /** For deploy items: addresses parsed from stdout, keyed by produces key. */
  addresses?: Record<string, string>;
  /** Raw stdout from forge (only present in JSON output). */
  stdout?: string;
  error?: string;
}

/** Side-effect surface, injectable for tests. */
export interface ApplyDeps {
  /**
   * Return the env-var bag the executor should pass to forge for this env.
   * In production this is process.env merged with the bundle's config.json.
   */
  resolveEnv(env: EnvName): Record<string, string>;
  /** Spawn forge. */
  runForge: ForgeRunner;
  /** Persist a manifest after a successful item. */
  persistManifest(env: EnvName, manifest: Manifest): Promise<void>;
  /** Persist a config.json after addresses are recorded. */
  persistConfig(
    bundle: "testnet" | "mainnet",
    config: Record<string, unknown>,
  ): Promise<void>;
  /** Current git SHA, or undefined if outside a git repo. */
  gitSha(): Promise<string | undefined>;
  /** Wall clock — injected so tests get deterministic timestamps. */
  now(): Date;
  /** Compute the current bytecode hash for a contract artifact. */
  bytecodeHashFor(contract: string): Promise<string | undefined>;
  /** Block-number snapshot recorded in state.blockCreated. Optional. */
  getBlockNumber?: (rpcUrl: string) => Promise<number | undefined>;
}

export interface ApplyOptions {
  /** Manifests (mutated in place; persisted via deps.persistManifest). */
  manifests: Record<EnvName, Manifest>;
  /** Config.json contents per bundle (mutated in place; persisted). */
  configs: Partial<Record<"testnet" | "mainnet", Record<string, unknown>>>;
  /** Ordered plan items to apply. */
  items: PlanItem[];
  /** Don't actually invoke forge; print intentions and return. */
  dryRun?: boolean;
  /**
   * Invoke forge WITHOUT `--broadcast` and skip state persistence. Used for
   * a real-RPC simulation that exercises the deploy script end-to-end (catches
   * reverts, constructor failures, wiring issues) without spending gas or
   * changing on-chain state. Forces `--verify` off, since verification is
   * meaningless without broadcast.
   */
  simulate?: boolean;
  /** Don't halt on the first failure. */
  continueOnError?: boolean;
  /** Skip forge --verify; tests + air-gapped runs use this. */
  noVerify?: boolean;
}

// ---------- helpers ----------

function isDeployItem(i: PlanItem): i is DeployItem {
  return i.kind === "deploy";
}

function isConfigureItem(i: PlanItem): i is ConfigureItem {
  return i.kind === "configure";
}

/**
 * Parse "<KEY>= 0x..." from forge stdout. Forge prefixes console.log output
 * with two spaces, and the existing scripts log "FACTORY_ADDRESS=" + addr,
 * which forge prints as "  FACTORY_ADDRESS= 0x…".
 */
export function parseProducedAddress(
  stdout: string,
  key: string,
): string | undefined {
  // Escape regex meta — keys are usually [A-Z_]+ but be safe.
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^\\s*${escaped}=\\s*(0x[a-fA-F0-9]{40})\\s*$`, "m");
  const m = stdout.match(re);
  return m ? m[1] : undefined;
}

/**
 * Build the `--verify …` argument array for forge from the manifest's
 * verifier config + the resolved env. Returns [] when no verifier is
 * declared on the chain, or when the required env var is missing (matches
 * deploy.sh behavior — silently skip verification rather than fail).
 */
export function buildVerifyArgs(
  verifier: VerifierConfig | undefined,
  env: Record<string, string>,
): string[] {
  if (!verifier) return [];
  if (verifier.kind === "blockscout") {
    const url = env[verifier.explorerUrlEnv];
    if (!url) return [];
    return ["--verify", "--verifier", "blockscout", "--verifier-url", url];
  }
  if (verifier.kind === "etherscan") {
    const key = env[verifier.apiKeyEnv];
    if (!key) return [];
    return ["--verify", "--etherscan-api-key", key];
  }
  return [];
}

/**
 * Generate the deterministic CREATE3 factory salt for a bundle. Same
 * algorithm as deploy.sh's ensure_factory_salt:
 *   keccak256("sapience-prediction-market-token-factory-<bundle>-<YYYY-MM-DD>")
 * The keccak runner is injected so tests don't need foundry.
 */
export async function factorySaltFor(
  bundle: "testnet" | "mainnet",
  now: Date,
  keccak256: (input: string) => Promise<string>,
): Promise<string> {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const seed = `sapience-prediction-market-token-factory-${bundle}-${yyyy}-${mm}-${dd}`;
  return keccak256(seed);
}

/**
 * Check that the deployer private key in env actually controls the address
 * declared in `deployerAddressEnv`. Matches deploy.sh's validate_deployers
 * intent. Returns ok=false with a descriptive reason on mismatch.
 */
export async function validateDeployer(
  manifest: Manifest,
  env: Record<string, string>,
  deriveAddress: (pk: string) => Promise<string>,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const pkKey = manifest.chain.deployerPrivateKeyEnv;
  const addrKey = manifest.chain.deployerAddressEnv;
  if (!pkKey || !addrKey)
    return { ok: true }; // Nothing to check.
  const pk = env[pkKey];
  const declared = env[addrKey];
  if (!pk || !declared) return { ok: true }; // Caller's responsibility.
  let derived: string;
  try {
    derived = await deriveAddress(pk);
  } catch (e) {
    return {
      ok: false,
      reason: `failed to derive address from ${pkKey}: ${(e as Error).message}`,
    };
  }
  if (derived.toLowerCase() !== declared.toLowerCase())
    return {
      ok: false,
      reason: `${manifest.env}: ${pkKey} controls ${derived}, but ${addrKey} is set to ${declared}`,
    };
  return { ok: true };
}

// ---------- core apply logic ----------

export async function applyPlan(
  opts: ApplyOptions,
  deps: ApplyDeps,
): Promise<ApplyItemResult[]> {
  const results: ApplyItemResult[] = [];

  for (const item of opts.items) {
    const result = await applyItem(item, opts, deps);
    results.push(result);
    if (result.status === "failure" && !opts.continueOnError) break;
  }

  return results;
}

async function applyItem(
  item: PlanItem,
  opts: ApplyOptions,
  deps: ApplyDeps,
): Promise<ApplyItemResult> {
  const manifest = opts.manifests[item.env];
  if (!manifest)
    return failure(item, `manifest for env "${item.env}" not loaded`);
  const unit = manifest.units[item.unit];
  if (!unit) return failure(item, `unit "${item.unit}" not in manifest`);

  // Dry-run shortcut: don't gate on secrets or RPC env vars. A preview
  // shouldn't require operators to load `.env` just to see the plan.
  if (opts.dryRun) {
    return { item, status: "skipped-dry-run" };
  }

  // Resolve env + required keys.
  const env = deps.resolveEnv(item.env);
  const rpcKey = manifest.chain.rpcUrlEnv;
  const pkKey = manifest.chain.deployerPrivateKeyEnv;
  if (!rpcKey || !pkKey)
    return failure(
      item,
      `manifest.chain for "${item.env}" is missing rpcUrlEnv/deployerPrivateKeyEnv`,
    );
  const rpcUrl = env[rpcKey];
  const privateKey = env[pkKey];
  if (!rpcUrl)
    return failure(item, `env var ${rpcKey} not set (needed for ${item.env})`);
  if (!privateKey)
    return failure(item, `env var ${pkKey} not set (needed for ${item.env})`);

  // Compose verify args (only on deploys; configures don't need verification;
  // simulations can't verify because nothing is broadcast).
  const extraArgs =
    isDeployItem(item) && !opts.noVerify && !opts.simulate
      ? buildVerifyArgs(manifest.chain.verifier, env)
      : [];

  // Capture pre-deploy block number for any deploy: it lands in state.blockCreated
  // and feeds the SDK's `blockCreated` field via sync-sdk. Best-effort —
  // missing values are fine (the SDK already accepts entries without it).
  let preDeployBlock: number | undefined;
  if (isDeployItem(item) && !opts.simulate && deps.getBlockNumber) {
    try {
      preDeployBlock = await deps.getBlockNumber(rpcUrl);
    } catch {
      // ignore; field stays undefined
    }
  }

  // Inject `OUTPUT_KEY` so single-output scripts that don't hardcode the
  // env-var name (e.g. `DeployVault.s.sol`, reused across multiple manifest
  // units with distinct produces keys) can emit under whichever key this
  // particular unit expects. Multi-output scripts ignore the convention and
  // emit each key explicitly.
  const forgeEnv: Record<string, string> = { ...env };
  if (isDeployItem(item) && unit.produces.length > 0) {
    forgeEnv.OUTPUT_KEY = unit.produces[0];
  }

  // Run forge. Simulations omit --broadcast so the script executes against the
  // forked RPC state without spending gas or producing a tx.
  const forgeRes = await deps.runForge({
    script: item.script,
    cwd: PROTOCOL_ROOT,
    rpcUrl,
    privateKey,
    env: forgeEnv,
    broadcast: !opts.simulate,
    extraArgs,
  });

  if (forgeRes.exitCode !== 0) {
    return {
      item,
      status: "failure",
      stdout: forgeRes.stdout,
      error: `forge exited with code ${forgeRes.exitCode}: ${forgeRes.stderr.slice(0, 200)}`,
    };
  }

  // Deploy items: parse produced addresses + update state.
  if (isDeployItem(item)) {
    const addresses: Record<string, string> = {};
    for (const key of unit.produces) {
      const addr = parseProducedAddress(forgeRes.stdout, key);
      if (!addr)
        return {
          item,
          status: "failure",
          stdout: forgeRes.stdout,
          error: `forge succeeded but produced-address key "${key}" not found in stdout`,
        };
      addresses[key] = addr;
    }

    // Simulation: forge ran the script, addresses were parsed (so we can show
    // what WOULD be deployed), but nothing was broadcast — do NOT touch state
    // or persist anything.
    if (opts.simulate) {
      return {
        item,
        status: "simulated",
        addresses,
        stdout: forgeRes.stdout,
      };
    }

    const bytecodeHash = await deps.bytecodeHashFor(unit.contract);
    const gitSha = await deps.gitSha();
    const primaryAddress = addresses[unit.produces[0]];
    const nowIso = deps.now().toISOString();

    // Rotate: if there was a previous address and it differs from the new one,
    // push it (plus its metadata) to state.legacy[0] as the most-recent past
    // deployment. The SDK generator surfaces this same array verbatim.
    const prev = unit.state ?? {};
    const legacy: import("./schema.ts").LegacyDeployEntry[] = [
      ...(prev.legacy ?? []),
    ];
    if (
      prev.address &&
      prev.address.toLowerCase() !== primaryAddress.toLowerCase()
    ) {
      legacy.unshift({
        address: prev.address,
        addresses: prev.addresses,
        blockCreated: prev.blockCreated,
        deployedAt: prev.deployedAt,
        gitSha: prev.gitSha,
        txHash: prev.txHash,
        replacedAt: nowIso,
      });
    }

    unit.state = {
      ...prev,
      address: primaryAddress,
      addresses: { ...addresses },
      bytecodeHash: bytecodeHash ?? prev.bytecodeHash,
      // The runtime code at the new address now matches the artifact we just
      // deployed. Sync `onchainBytecodeHash` so the next plan run doesn't
      // immediately flag this unit as drifted (until populate refreshes it
      // against the live RPC again).
      onchainBytecodeHash: bytecodeHash ?? prev.onchainBytecodeHash,
      gitSha: gitSha ?? prev.gitSha,
      deployedAt: nowIso,
      blockCreated: preDeployBlock ?? prev.blockCreated,
      legacy: legacy.length > 0 ? legacy : undefined,
    };

    // Write all produced keys back to the bundle config.
    const config = opts.configs[manifest.bundle] ?? {};
    for (const [k, v] of Object.entries(addresses)) config[k] = v;
    opts.configs[manifest.bundle] = config;

    await deps.persistManifest(item.env, manifest);
    await deps.persistConfig(manifest.bundle, config);

    return {
      item,
      status: "success",
      addresses,
      stdout: forgeRes.stdout,
    };
  }

  // Configure items: state unchanged. Persist nothing.
  return {
    item,
    status: opts.simulate ? "simulated" : "success",
    stdout: forgeRes.stdout,
  };
}

function failure(item: PlanItem, error: string): ApplyItemResult {
  return { item, status: "failure", error };
}

// ---------- default IO bindings (production) ----------

export const defaultForgeRunner: ForgeRunner = async (inv) => {
  const args = [
    "script",
    inv.script,
    "--rpc-url",
    inv.rpcUrl,
    "--private-key",
    inv.privateKey,
  ];
  if (inv.broadcast) args.push("--broadcast");
  if (inv.extraArgs && inv.extraArgs.length > 0) args.push(...inv.extraArgs);

  return new Promise<ForgeResult>((resolveProm) => {
    const child = spawn("forge", args, {
      cwd: inv.cwd,
      env: { ...process.env, ...inv.env },
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const s = chunk.toString();
      stdout += s;
      process.stdout.write(s);
    });
    child.stderr.on("data", (chunk) => {
      const s = chunk.toString();
      stderr += s;
      process.stderr.write(s);
    });
    child.on("close", (code) => {
      resolveProm({ stdout, stderr, exitCode: code ?? 1 });
    });
    child.on("error", (err) => {
      resolveProm({
        stdout,
        stderr: stderr + "\n" + (err.message ?? String(err)),
        exitCode: 127,
      });
    });
  });
};

// (spawn, env, and cast helpers moved to ./_shared/spawn.ts + ./_shared/env.ts)

// ---------- CLI ----------

interface CliOptions {
  dryRun: boolean;
  simulate: boolean;
  continueOnError: boolean;
  forced: Set<string>;
  json: boolean;
  noVerify: boolean;
  skipBuild: boolean;
  noSyncSdk: boolean;
  bundle?: import("./schema.ts").Bundle;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    dryRun: false,
    simulate: false,
    continueOnError: false,
    forced: new Set(),
    json: false,
    noVerify: false,
    skipBuild: false,
    noSyncSdk: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue; // pnpm forwards the end-of-options sentinel verbatim
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--simulate") opts.simulate = true;
    else if (a === "--continue-on-error") opts.continueOnError = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--no-verify") opts.noVerify = true;
    else if (a === "--skip-build") opts.skipBuild = true;
    else if (a === "--no-sync-sdk") opts.noSyncSdk = true;
    else if (a === "--bundle") {
      const v = argv[++i];
      if (v !== "testnet" && v !== "mainnet")
        throw new Error(`--bundle must be "testnet" or "mainnet", got "${v}"`);
      opts.bundle = v;
    } else if (a === "--force") {
      const v = argv[++i];
      if (!v) throw new Error("--force requires a unit ref (env:Unit)");
      opts.forced.add(v);
    } else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  if (!opts.bundle)
    throw new Error(
      "--bundle <testnet|mainnet> is required (apply never operates across both bundles)",
    );
  if (opts.dryRun && opts.simulate)
    throw new Error(
      "--dry-run and --simulate are mutually exclusive (dry-run skips forge entirely; simulate runs it without broadcasting)",
    );
  return opts;
}

function printHelp(): void {
  console.log(`Usage: apply --bundle <testnet|mainnet> [options]

Computes a plan against the current state for the selected bundle and applies
it (deploys + configures). Persists manifest state + bundle config after every
successful item.

Pre-flight runs in order: forge build --ast --quiet, deployer validation
(cast wallet address matches deployerAddressEnv), FACTORY_SALT auto-generation
per bundle (if unset).

Options:
  --bundle <name>       REQUIRED. Either testnet or mainnet. Apply never
                        operates across both bundles at once.
  --dry-run             Build the plan but do not invoke forge for deploys.
  --simulate            Invoke forge WITHOUT --broadcast (real-RPC simulation)
                        and skip state persistence. Useful to validate the
                        deploy script against the live chain without spending
                        gas. Disables --verify automatically.
  --continue-on-error   Don't halt the plan on a failed item.
  --no-verify           Skip --verify flags on forge invocations.
  --skip-build          Don't run forge build before computing the plan.
  --no-sync-sdk         Don't regenerate packages/sdk/contracts/addresses.ts.
  --force <env:Unit>    Force a unit to redeploy (repeatable; forwarded to plan).
  --json                Emit per-item results as JSON.
  -h, --help            Show this help.

Required env vars (per the manifest's chain.deployerPrivateKeyEnv / rpcUrlEnv).
The CLI loads <bundle>/.env and <bundle>/config.json automatically.
`);
}

async function runCli(opts: CliOptions): Promise<void> {
  const manifests = await loadAllManifests(MANIFEST_DIR);
  const artifactsDir = resolve(PROTOCOL_ROOT, "out");

  // ---- Pre-flight: forge build ----
  if (!opts.skipBuild) {
    console.log("→ forge build --ast --quiet");
    const build = await forgeBuild(PROTOCOL_ROOT);
    if (build.exitCode !== 0) {
      console.error(build.stderr || build.stdout);
      throw new Error(`forge build failed (exit ${build.exitCode})`);
    }
  }

  // Load configs + .env files for each bundle once.
  const configs: Partial<Record<"testnet" | "mainnet", Record<string, unknown>>> = {};
  const bundleEnvs: Record<"testnet" | "mainnet", Record<string, string>> = {
    testnet: {},
    mainnet: {},
  };
  for (const bundle of ["testnet", "mainnet"] as const) {
    configs[bundle] = loadConfigJson(PROTOCOL_ROOT, bundle);
    bundleEnvs[bundle] = await loadEnvFile(PROTOCOL_ROOT, bundle);
  }

  const resolveEnv = (env: EnvName): Record<string, string> => {
    const m = manifests[env];
    const bundle = m.bundle;
    const cfg = configs[bundle] ?? {};
    const envFile = bundleEnvs[bundle];
    const out: Record<string, string> = {};
    // .env shadowed by config.json shadowed by process.env (matches deploy.sh).
    for (const [k, v] of Object.entries(envFile)) out[k] = v;
    for (const [k, v] of Object.entries(cfg))
      if (typeof v === "string") out[k] = v;
      else if (typeof v === "number") out[k] = String(v);
    for (const [k, v] of Object.entries(process.env))
      if (typeof v === "string") out[k] = v;
    return out;
  };

  // ---- Plan (restricted to the selected bundle) ----
  const currentHashes = await readCurrentHashes(manifests, artifactsDir);
  const plan = computePlan({
    manifests,
    currentHashes,
    forced: opts.forced,
    bundle: opts.bundle,
  });

  if (plan.items.length === 0) {
    console.log("✓ No changes — nothing to apply.");
    return;
  }

  // ---- Pre-flight: validate deployers for every env touched by the plan ----
  // Skip on dry-run: the validation calls `cast wallet address` and needs the
  // real signing key, but a preview shouldn't require secrets.
  const touchedEnvs = new Set(plan.items.map((i) => i.env));
  if (!opts.dryRun) {
    for (const env of touchedEnvs) {
      const r = await validateDeployer(
        manifests[env],
        resolveEnv(env),
        (pk) => castDeriveAddress(pk, PROTOCOL_ROOT),
      );
      if (!r.ok) throw new Error(`deployer validation failed: ${r.reason}`);
    }
  }

  // ---- Pre-flight: auto-generate FACTORY_SALT per bundle if unset ----
  // Same seed across all envs in a bundle (so CREATE3 twins agree).
  const now = new Date();
  const touchedBundles = new Set(
    [...touchedEnvs].map((e) => manifests[e].bundle),
  );
  for (const bundle of touchedBundles) {
    if (!bundleEnvs[bundle].FACTORY_SALT && !process.env.FACTORY_SALT) {
      const salt = await factorySaltFor(bundle, now, (s) =>
        castKeccak256(s, PROTOCOL_ROOT),
      );
      bundleEnvs[bundle].FACTORY_SALT = salt;
      console.log(`→ FACTORY_SALT (${bundle}) = ${salt}`);
    }
  }

  const deps: ApplyDeps = {
    resolveEnv,
    runForge: defaultForgeRunner,
    persistManifest: async (env, manifest) => {
      const p = join(MANIFEST_DIR, `${env}.json`);
      await writeFile(p, JSON.stringify(manifest, null, 2) + "\n", "utf8");
    },
    persistConfig: async (bundle, config) => {
      const p = resolve(PROTOCOL_ROOT, "deployment", bundle, "config.json");
      await writeFile(p, JSON.stringify(config, null, 2) + "\n", "utf8");
    },
    gitSha: () => readGitSha(PROTOCOL_ROOT),
    now: () => new Date(),
    bytecodeHashFor: async (contract) => {
      const h = await readArtifactHashes(contract, artifactsDir);
      return h.bytecodeHash;
    },
    getBlockNumber: (rpcUrl) => castGetBlockNumber(rpcUrl, PROTOCOL_ROOT),
  };

  const results = await applyPlan(
    {
      manifests,
      configs,
      items: plan.items,
      dryRun: opts.dryRun,
      simulate: opts.simulate,
      continueOnError: opts.continueOnError,
      noVerify: opts.noVerify,
    },
    deps,
  );

  if (opts.json) {
    // Don't dump the full stdout in JSON by default — it can be megabytes.
    console.log(
      JSON.stringify(
        results.map((r) => ({ ...r, stdout: undefined })),
        null,
        2,
      ),
    );
  } else {
    printSummary(results);
  }

  // Regenerate the SDK addresses.ts if any deploy actually changed state.
  const anyDeploy = results.some(
    (r) => r.status === "success" && r.addresses !== undefined,
  );
  if (anyDeploy && !opts.noSyncSdk && !opts.dryRun) {
    await syncSdkAfterApply(manifests);
  }

  const failed = results.some((r) => r.status === "failure");
  if (failed) process.exit(1);
}

async function syncSdkAfterApply(
  manifests: Record<EnvName, Manifest>,
): Promise<void> {
  const sdkFile = resolve(
    PROTOCOL_ROOT,
    "..",
    "sdk",
    "contracts",
    "addresses.ts",
  );
  if (!existsSync(sdkFile)) {
    console.warn(
      `[warn] SDK addresses.ts not found at ${sdkFile} — skipping sync-sdk`,
    );
    return;
  }
  const source = await readFile(sdkFile, "utf8");
  const result = generateSdkAddresses(manifests, source);
  if (result.source === source) {
    console.log("✓ SDK addresses.ts already in sync.");
    return;
  }
  await writeFile(sdkFile, result.source, "utf8");
  console.log(
    `→ Regenerated ${result.ownedExports.length} SDK export(s) in addresses.ts`,
  );
}

function printSummary(results: ApplyItemResult[]): void {
  console.log(`\n=== Apply summary (${results.length} items) ===\n`);
  for (const r of results) {
    const tag =
      r.status === "success"
        ? "✓"
        : r.status === "skipped-dry-run"
          ? "·"
          : r.status === "simulated"
            ? "~"
            : "✗";
    const ref = `${r.item.env}:${r.item.unit}`;
    console.log(`${tag} [${r.item.kind}] ${ref}  (${r.item.script})`);
    if (r.addresses) {
      for (const [k, v] of Object.entries(r.addresses))
        console.log(`    ${k}=${v}`);
    }
    if (r.error) console.log(`    error: ${r.error}`);
  }
  console.log("");
}

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("apply.ts");

if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  runCli(opts).catch((err) => {
    console.error(err.stack ?? err.message ?? err);
    process.exit(1);
  });
}
