// verify.ts — re-verify deployed contracts on their chain's explorer.
//
// Apply already passes --verify inline during a deploy. This module handles
// the standalone case: re-verifying contracts after a failed inline run, or
// against a freshly-built artifact for an existing on-chain deployment.
//
// Iterates the manifests filtered by --bundle (required), reads each unit's
// state.address + contractPath, and spawns `forge verify-contract` with the
// right flags per chain.verifier.

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ENV_NAMES,
  isEnvName,
  type Bundle,
  type DeployUnit,
  type EnvName,
  type Manifest,
  type VerifierConfig,
} from "./schema.ts";
import { loadAllManifests } from "./plan.ts";
import { loadConfigJson, loadEnvFile } from "./_shared/env.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROTOCOL_ROOT = resolve(HERE, "..", "..");
const MANIFEST_DIR = resolve(HERE, "env");

// ---------- types ----------

export interface VerifyInvocation {
  /** "<path>:<Contract>" forge verify-contract argument. */
  contractPath: string;
  /** Address to verify. */
  address: string;
  /** Chain ID forge needs to know about. */
  chainId: number;
  /** Verifier args appended after the address+path: --verifier blockscout … or --etherscan-api-key … */
  verifyFlags: string[];
  /** Env to pass to the spawned forge (mirrors apply.ts's resolveEnv). */
  env: Record<string, string>;
  /** Working directory for forge. */
  cwd: string;
}

export interface VerifyResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type VerifyRunner = (inv: VerifyInvocation) => Promise<VerifyResult>;

export interface VerifyItemResult {
  env: EnvName;
  unit: string;
  contractPath?: string;
  address?: string;
  status: "verified" | "skipped" | "failure";
  /** Human reason for skip or failure. */
  reason?: string;
  stdout?: string;
}

export interface VerifyOptions {
  manifests: Record<EnvName, Manifest>;
  bundle: Bundle;
  /** If set, restrict further to a single env in the bundle. */
  env?: EnvName;
  /** Don't halt on first failure. */
  continueOnError?: boolean;
}

export interface VerifyDeps {
  resolveEnv(env: EnvName): Record<string, string>;
  runVerify: VerifyRunner;
}

// ---------- helpers ----------

/**
 * Build the `--verify`-style argument array for a standalone verify run.
 * Mirrors apply.ts's buildVerifyArgs but emits the args for
 * `forge verify-contract`, not `forge script --verify`.
 */
export function buildVerifyFlags(
  verifier: VerifierConfig | undefined,
  env: Record<string, string>,
): { flags: string[] } | { skip: string } {
  if (!verifier) return { skip: "no verifier configured on chain" };
  if (verifier.kind === "blockscout") {
    const url = env[verifier.explorerUrlEnv];
    if (!url) return { skip: `${verifier.explorerUrlEnv} not set` };
    return { flags: ["--verifier", "blockscout", "--verifier-url", url] };
  }
  if (verifier.kind === "etherscan") {
    const key = env[verifier.apiKeyEnv];
    if (!key) return { skip: `${verifier.apiKeyEnv} not set` };
    return { flags: ["--etherscan-api-key", key] };
  }
  return { skip: "unknown verifier kind" };
}

// ---------- core verify logic ----------

export async function verifyAll(
  opts: VerifyOptions,
  deps: VerifyDeps,
): Promise<VerifyItemResult[]> {
  const results: VerifyItemResult[] = [];

  for (const env of ENV_NAMES) {
    if (opts.env && env !== opts.env) continue;
    const manifest = opts.manifests[env];
    if (!manifest) continue;
    if (manifest.bundle !== opts.bundle) continue;

    for (const unit of Object.values(manifest.units)) {
      const unitResults = await verifyOne(env, manifest, unit, opts, deps);
      for (const r of unitResults) {
        results.push(r);
        if (r.status === "failure" && !opts.continueOnError) {
          return results;
        }
      }
    }
  }

  return results;
}

async function verifyOne(
  env: EnvName,
  manifest: Manifest,
  unit: DeployUnit,
  opts: VerifyOptions,
  deps: VerifyDeps,
): Promise<VerifyItemResult[]> {
  const envVars = deps.resolveEnv(env);
  const verifyFlags = buildVerifyFlags(manifest.chain.verifier, envVars);

  // Build the list of (contractPath, address, label) tuples to verify. For a
  // multi-output unit we emit one tuple per declared output; for a regular
  // unit it's the single (contractPath, state.address) pair.
  type Target = {
    label: string;
    contractPath?: string;
    address?: string;
  };
  const targets: Target[] = [];
  if (unit.outputs) {
    for (const [producesKey, output] of Object.entries(unit.outputs)) {
      const addr =
        unit.state?.addresses?.[producesKey] ??
        (producesKey === unit.produces[0] ? unit.state?.address : undefined);
      targets.push({
        label: `${unit.name}[${producesKey}]`,
        contractPath: output.contractPath,
        address: addr,
      });
    }
  } else {
    targets.push({
      label: unit.name,
      contractPath: unit.contractPath,
      address: unit.state?.address,
    });
  }

  const out: VerifyItemResult[] = [];
  for (const t of targets) {
    const base: VerifyItemResult = {
      env,
      unit: t.label,
      contractPath: t.contractPath,
      address: t.address,
      status: "skipped",
    };
    if (!t.address) {
      out.push({ ...base, reason: "no recorded address" });
      continue;
    }
    if (!t.contractPath) {
      out.push({ ...base, reason: "unit has no contractPath" });
      continue;
    }
    if ("skip" in verifyFlags) {
      out.push({ ...base, reason: verifyFlags.skip });
      continue;
    }

    const res = await deps.runVerify({
      contractPath: t.contractPath,
      address: t.address,
      chainId: manifest.chain.chainId,
      verifyFlags: verifyFlags.flags,
      env: envVars,
      cwd: PROTOCOL_ROOT,
    });

    // forge verify-contract exits 0 on success AND on "already verified". Both
    // are fine — only a non-zero exit (or a clearly bad stderr) is failure.
    if (res.exitCode === 0) {
      out.push({ ...base, status: "verified", stdout: res.stdout });
    } else {
      out.push({
        ...base,
        status: "failure",
        stdout: res.stdout,
        reason: `forge exited ${res.exitCode}: ${res.stderr.slice(0, 200)}`,
      });
    }
  }
  return out;
}

// ---------- default IO bindings ----------

export const defaultVerifyRunner: VerifyRunner = async (inv) => {
  const args = [
    "verify-contract",
    inv.address,
    inv.contractPath,
    "--chain-id",
    String(inv.chainId),
    ...inv.verifyFlags,
  ];

  return new Promise<VerifyResult>((resolveProm) => {
    const child = spawn("forge", args, {
      cwd: inv.cwd,
      env: { ...process.env, ...inv.env },
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => {
      const s = c.toString();
      stdout += s;
      process.stdout.write(s);
    });
    child.stderr.on("data", (c) => {
      const s = c.toString();
      stderr += s;
      process.stderr.write(s);
    });
    child.on("close", (code) =>
      resolveProm({ stdout, stderr, exitCode: code ?? 1 }),
    );
    child.on("error", (err) =>
      resolveProm({
        stdout,
        stderr: stderr + "\n" + (err.message ?? String(err)),
        exitCode: 127,
      }),
    );
  });
};

// (loadConfigJson, loadEnvFile moved to ./_shared/env.ts)

// ---------- CLI ----------

interface CliOptions {
  bundle?: Bundle;
  env?: EnvName;
  continueOnError: boolean;
  json: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { continueOnError: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    if (a === "--continue-on-error") opts.continueOnError = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--bundle") {
      const v = argv[++i];
      if (v !== "testnet" && v !== "mainnet")
        throw new Error(`--bundle must be "testnet" or "mainnet", got "${v}"`);
      opts.bundle = v;
    } else if (a === "--env") {
      const v = argv[++i];
      if (!v || !isEnvName(v))
        throw new Error(`--env must be one of ${ENV_NAMES.join(", ")}`);
      opts.env = v;
    } else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  if (!opts.bundle)
    throw new Error(
      "--bundle <testnet|mainnet> is required (verify never operates across both bundles)",
    );
  return opts;
}

function printHelp(): void {
  console.log(`Usage: verify --bundle <testnet|mainnet> [options]

Re-verifies every deployed unit in the selected bundle on its chain's
explorer (Blockscout for Ethereal, Etherscan-compatible for Arbitrum +
Polygon). Skips units that have no recorded address, no contractPath, or
whose chain has no verifier config.

forge verify-contract exits 0 on "already verified" too, so re-runs are
safe and idempotent.

Options:
  --bundle <name>       REQUIRED. testnet or mainnet.
  --env <name>          Restrict further to one env inside the bundle.
  --continue-on-error   Don't halt on the first failed unit.
  --json                Emit per-unit results as JSON.
  -h, --help            Show this help.
`);
}

async function runCli(opts: CliOptions): Promise<void> {
  const manifests = await loadAllManifests(MANIFEST_DIR);

  if (opts.env) {
    const m = manifests[opts.env];
    if (!m) throw new Error(`unknown env "${opts.env}"`);
    if (m.bundle !== opts.bundle)
      throw new Error(
        `env "${opts.env}" is in bundle "${m.bundle}", not "${opts.bundle}"`,
      );
  }

  const bundle = opts.bundle!;
  const config = loadConfigJson(PROTOCOL_ROOT, bundle);
  const envFile = await loadEnvFile(PROTOCOL_ROOT, bundle);

  const resolveEnv = (_env: EnvName): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(envFile)) out[k] = v;
    for (const [k, v] of Object.entries(config))
      if (typeof v === "string") out[k] = v;
      else if (typeof v === "number") out[k] = String(v);
    for (const [k, v] of Object.entries(process.env))
      if (typeof v === "string") out[k] = v;
    return out;
  };

  const results = await verifyAll(
    {
      manifests,
      bundle,
      env: opts.env,
      continueOnError: opts.continueOnError,
    },
    {
      resolveEnv,
      runVerify: defaultVerifyRunner,
    },
  );

  if (opts.json) {
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

  if (results.some((r) => r.status === "failure")) process.exit(1);
}

function printSummary(results: VerifyItemResult[]): void {
  if (results.length === 0) {
    console.log("No units to verify in the selected bundle.");
    return;
  }
  console.log(`\n=== Verify summary (${results.length} units) ===\n`);
  for (const r of results) {
    const tag =
      r.status === "verified" ? "✓" : r.status === "skipped" ? "·" : "✗";
    const addr = r.address ? r.address : "(no address)";
    console.log(`${tag} [${r.env}] ${r.unit}  ${addr}`);
    if (r.reason) console.log(`    ${r.status}: ${r.reason}`);
  }
  console.log("");
}

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("verify.ts");

if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  runCli(opts).catch((err) => {
    console.error(err.stack ?? err.message ?? err);
    process.exit(1);
  });
}
