// populate.ts — Phase 1 manifest populator.
//
// Reads each manifest, walks its units, and fills in `state` from two sources:
//   1. Forge artifact under `out/<Contract>.sol/<Contract>.json` — computes
//      sha256 of bytecode.object and deployedBytecode.object so we have a
//      stable change signal for Phase 2's diff detector.
//   2. The relevant `config.json` (testnet bundle -> deployment/testnet,
//      mainnet bundle -> deployment/mainnet) — looks up the unit's `produces`
//      env-var keys to recover currently-deployed addresses.
//
// Phase 1 is read-only on the deployment surface: it does not deploy anything
// or talk to RPCs. It just transcribes existing state into the manifest.
//
// Usage:
//   pnpm --filter @sapience/protocol run manifest:populate
//   pnpm --filter @sapience/protocol run manifest:populate -- --env ethereal-testnet
//   pnpm --filter @sapience/protocol run manifest:populate -- --dry-run

import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertCrossEnvRefs,
  assertManifest,
  ENV_NAMES,
  isEnvName,
  type DeployUnit,
  type DeployUnitState,
  type EnvName,
  type Manifest,
} from "./schema.ts";
import { castGetCode } from "./_shared/spawn.ts";
import { loadConfigJson, loadEnvFile } from "./_shared/env.ts";

// ---------- paths ----------

const HERE = dirname(fileURLToPath(import.meta.url));
/** packages/protocol root. */
const PROTOCOL_ROOT = resolve(HERE, "..", "..");
const MANIFEST_DIR = resolve(HERE, "env");
const ARTIFACTS_DIR = resolve(PROTOCOL_ROOT, "out");

function manifestPath(env: EnvName): string {
  return join(MANIFEST_DIR, `${env}.json`);
}

function configJsonPath(bundle: "testnet" | "mainnet"): string {
  return resolve(PROTOCOL_ROOT, "deployment", bundle, "config.json");
}

function artifactPath(contract: string): string {
  return join(ARTIFACTS_DIR, `${contract}.sol`, `${contract}.json`);
}

// ---------- hashing ----------

function sha256Hex(hex: string): string {
  // Normalise: strip 0x, lowercase. Hash the *bytes*, not the ascii.
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length === 0) return "";
  const buf = Buffer.from(clean, "hex");
  return "0x" + createHash("sha256").update(buf).digest("hex");
}

/**
 * Strip the Solidity metadata trailer from runtime bytecode.
 *
 * solc appends a CBOR-encoded metadata blob to the end of every deployed
 * bytecode (compiler version + IPFS hash of source). The last 2 bytes
 * encode the length of the blob; the blob itself precedes those bytes.
 * Two builds of bit-for-bit identical source can produce different trailers
 * (different compiler version, whitespace, file ordering) — comparing the
 * stripped bytecode gives a structural hash that ignores those.
 *
 * Safety: if the encoded length is implausibly large (> 256 bytes) we
 * return the input unchanged. Better a false-positive drift on weird
 * bytecode than an incorrect strip on bytecode that lacks the trailer.
 */
export function stripMetadataTrailer(hex: string): string {
  const prefix = hex.startsWith("0x") ? "0x" : "";
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length < 4) return hex;
  const len = parseInt(clean.slice(-4), 16);
  if (!Number.isFinite(len) || len === 0 || len > 256) return hex;
  const trailerChars = (len + 2) * 2;
  if (clean.length <= trailerChars) return hex;
  return prefix + clean.slice(0, -trailerChars);
}

/** One position inside runtime bytecode where solc emitted an immutable placeholder. */
export interface ImmutableRef {
  /** Byte offset into deployedBytecode.object. */
  start: number;
  /** Slot width in bytes (32 for address / uint256, etc). */
  length: number;
}

/**
 * Zero out the immutable-substitution byte ranges in runtime bytecode.
 *
 * solc emits the runtime code with zeros at every immutable slot; the
 * constructor writes the real value into those positions at deploy time.
 * So the artifact has zeros, the chain has real addresses/values — and a
 * direct hash comparison would always drift. Zeroing both sides cancels
 * that out and gives a structural hash of the actual code.
 */
export function normalizeRuntimeBytecode(
  hex: string,
  refs: ImmutableRef[] | undefined,
): string {
  if (!refs || refs.length === 0) return hex;
  const prefix = hex.startsWith("0x") ? "0x" : "";
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = Buffer.from(clean, "hex");
  for (const ref of refs) {
    const end = Math.min(ref.start + ref.length, bytes.length);
    if (ref.start >= bytes.length) continue;
    bytes.fill(0, ref.start, end);
  }
  return prefix + bytes.toString("hex");
}

interface ArtifactHashes {
  bytecodeHash?: string;
  creationCodeHash?: string;
  /** Flattened immutable byte ranges — re-used to normalize the on-chain code. */
  immutableRefs?: ImmutableRef[];
  artifactMissing?: true;
}

/**
 * Flatten the artifact's nested immutableReferences map into a single list.
 * The artifact stores it as `{ <astId>: [{ start, length }, …], … }`; only
 * the ranges matter here, the astId is just an opaque grouping key.
 */
function flattenImmutableRefs(raw: unknown): ImmutableRef[] {
  if (!raw || typeof raw !== "object") return [];
  const out: ImmutableRef[] = [];
  for (const value of Object.values(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    for (const entry of value) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      if (typeof e.start === "number" && typeof e.length === "number") {
        out.push({ start: e.start, length: e.length });
      }
    }
  }
  return out;
}

export async function readArtifactHashes(
  contract: string,
  artifactsDir: string = ARTIFACTS_DIR,
): Promise<ArtifactHashes> {
  const p = join(artifactsDir, `${contract}.sol`, `${contract}.json`);
  if (!existsSync(p)) return { artifactMissing: true };
  const raw = JSON.parse(await readFile(p, "utf8"));
  const deployed = raw?.deployedBytecode?.object as string | undefined;
  const creation = raw?.bytecode?.object as string | undefined;
  const immutableRefs = flattenImmutableRefs(
    raw?.deployedBytecode?.immutableReferences,
  );
  // Hash the structural form: zero immutable slots, then strip the metadata
  // trailer. The same transform applied to the on-chain code in populate
  // makes the two hashes directly comparable.
  const bytecodeHash = deployed
    ? sha256Hex(stripMetadataTrailer(normalizeRuntimeBytecode(deployed, immutableRefs)))
    : undefined;
  return {
    bytecodeHash,
    // Creation code isn't compared against the chain — leave it intact.
    creationCodeHash: creation ? sha256Hex(creation) : undefined,
    immutableRefs: immutableRefs.length > 0 ? immutableRefs : undefined,
  };
}

// ---------- config.json -> address lookup ----------

export type ConfigJson = Record<string, unknown>;

export function lookupAddress(
  produces: string[],
  config: ConfigJson,
): string | undefined {
  for (const key of produces) {
    const v = config[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

// ---------- SDK addresses.ts -> address lookup ----------

/** Shape we read out of `addresses.ts`. */
export type SdkAddressMap = Record<
  string,
  Record<string | number, { address?: string } | undefined> | undefined
>;

/**
 * Dynamically import the SDK's addresses.ts via tsx, returning the module's
 * `ChainAddressMap` exports keyed by export name. Tests pass their own map
 * instead of crossing the workspace boundary.
 */
export async function loadSdkAddresses(
  protocolRoot: string = PROTOCOL_ROOT,
): Promise<SdkAddressMap> {
  const p = resolve(protocolRoot, "..", "sdk", "contracts", "addresses.ts");
  if (!existsSync(p)) return {};
  try {
    const url = new URL(`file://${p}`).href;
    const mod = (await import(url)) as Record<string, unknown>;
    return mod as SdkAddressMap;
  } catch {
    return {};
  }
}

export function lookupSdkAddress(
  sdkAddresses: SdkAddressMap,
  exportName: string | undefined,
  chainId: number,
): string | undefined {
  if (!exportName) return undefined;
  const map = sdkAddresses[exportName];
  if (!map) return undefined;
  const entry = map[chainId] ?? map[String(chainId)];
  return entry?.address;
}

// ---------- populate ----------

interface PopulateOptions {
  /** If set, only populate manifests for these envs. */
  envs?: EnvName[];
  /** Don't write files. */
  dryRun?: boolean;
  /**
   * Skip the on-chain `eth_getCode` fetch. Useful for offline runs (CI without
   * RPC access, unit tests). When false (default), populate fetches live code
   * for every unit with an address + reachable RPC and records its hash in
   * `state.onchainBytecodeHash`.
   */
  skipOnchain?: boolean;
  /** Overrides for tests. */
  protocolRoot?: string;
  manifestDir?: string;
  /** Injectable for tests (defaults to loadSdkAddresses(protocolRoot)). */
  sdkAddresses?: SdkAddressMap;
  /**
   * Injectable for tests: returns the runtime bytecode at `address` on the
   * given chain (or undefined when unreachable / no code). Defaults to a
   * `cast code` subprocess.
   */
  fetchOnchainCode?: (
    env: EnvName,
    address: string,
  ) => Promise<string | undefined>;
}

interface PopulateReport {
  env: EnvName;
  unit: string;
  address: string | undefined;
  bytecodeHash: string | undefined;
  onchainBytecodeHash: string | undefined;
  artifactMissing: boolean;
  addressChanged: boolean;
  hashChanged: boolean;
  onchainDrift: boolean;
}

export async function populate(
  opts: PopulateOptions = {},
): Promise<PopulateReport[]> {
  const protocolRoot = opts.protocolRoot ?? PROTOCOL_ROOT;
  const manifestDir = opts.manifestDir ?? MANIFEST_DIR;
  const artifactsDir = resolve(protocolRoot, "out");

  const envs: EnvName[] = opts.envs ?? [...ENV_NAMES];

  // Load every requested manifest up-front so we can cross-validate refs.
  const all: Partial<Record<EnvName, Manifest>> = {};
  for (const env of envs) {
    const p = join(manifestDir, `${env}.json`);
    const raw = JSON.parse(await readFile(p, "utf8"));
    all[env] = assertManifest(raw, p);
  }
  assertCrossEnvRefs(all as Record<EnvName, Manifest | undefined>);

  // Load SDK addresses once — used as a fallback when config.json doesn't
  // carry an address for a unit (the SDK is the more complete source for
  // resolvers and CT contracts that nothing in config.json tracks).
  const sdkAddresses: SdkAddressMap =
    opts.sdkAddresses ?? (await loadSdkAddresses(protocolRoot));

  // Resolve the live `eth_getCode` fetcher. The default reads the bundle's
  // .env to find the RPC URL behind `chain.rpcUrlEnv` and shells out to
  // `cast code <address>`. Tests inject their own stub.
  const onchainCacheByBundle: Partial<
    Record<"testnet" | "mainnet", Record<string, string>>
  > = {};
  async function envFor(
    bundle: "testnet" | "mainnet",
  ): Promise<Record<string, string>> {
    const cached = onchainCacheByBundle[bundle];
    if (cached) return cached;
    // Mirror apply.ts's resolveEnv layering: .env first, then config.json,
    // then process.env wins on top. RPC URLs typically live in config.json.
    const merged: Record<string, string> = {};
    try {
      const fromFile = await loadEnvFile(protocolRoot, bundle);
      for (const [k, v] of Object.entries(fromFile)) merged[k] = v;
    } catch {
      // .env missing — fine, fall back to lower layers
    }
    try {
      const cfg = loadConfigJson(protocolRoot, bundle);
      for (const [k, v] of Object.entries(cfg))
        if (typeof v === "string") merged[k] = v;
        else if (typeof v === "number") merged[k] = String(v);
    } catch {
      // config.json missing — fine
    }
    for (const [k, v] of Object.entries(process.env))
      if (typeof v === "string") merged[k] = v;
    onchainCacheByBundle[bundle] = merged;
    return merged;
  }
  const defaultFetch = async (
    env: EnvName,
    address: string,
  ): Promise<string | undefined> => {
    const m = all[env];
    if (!m?.chain.rpcUrlEnv) return undefined;
    const envBag = await envFor(m.bundle);
    const rpcUrl = envBag[m.chain.rpcUrlEnv];
    if (!rpcUrl) return undefined;
    return castGetCode(rpcUrl, address, protocolRoot);
  };
  const fetchOnchainCode = opts.fetchOnchainCode ?? defaultFetch;

  const report: PopulateReport[] = [];

  for (const env of envs) {
    const manifest = all[env]!;
    const cfgPath = resolve(
      protocolRoot,
      "deployment",
      manifest.bundle,
      "config.json",
    );
    const config = existsSync(cfgPath)
      ? (JSON.parse(await readFile(cfgPath, "utf8")) as ConfigJson)
      : {};

    for (const unit of Object.values(manifest.units)) {
      const hashes = await readArtifactHashes(unit.contract, artifactsDir);
      const cfgAddress = lookupAddress(unit.produces, config);
      const sdkAddress = lookupSdkAddress(
        sdkAddresses,
        unit.sdkExport,
        manifest.chain.chainId,
      );
      // config.json wins (it's what `deploy.sh` writes today); SDK is a
      // fallback for units that aren't tracked there.
      const address = cfgAddress ?? sdkAddress;

      // For multi-output units, collect every produces key that has a value
      // in config.json so consumers (sync-sdk, verify) can fan out by key.
      const cfgAddresses: Record<string, string> = {};
      for (const key of unit.produces) {
        const v = config[key];
        if (typeof v === "string" && v.length > 0) cfgAddresses[key] = v;
      }

      const prev = unit.state ?? {};

      // Best-effort live fetch of on-chain runtime bytecode → hash. The
      // planner uses this to spot drift between the deployed code and the
      // current artifact. Failures (RPC down, unset URL, address with no
      // code) leave the field untouched.
      let onchainBytecodeHash: string | undefined = prev.onchainBytecodeHash;
      if (!opts.skipOnchain && address) {
        try {
          const code = await fetchOnchainCode(env, address);
          if (code) {
            // Apply the SAME normalization the artifact got: zero out the
            // immutable substitutions (chain has real values, artifact has
            // zeros there), then strip the metadata trailer. Now the two
            // hashes are directly comparable.
            const normalized = stripMetadataTrailer(
              normalizeRuntimeBytecode(code, hashes.immutableRefs),
            );
            onchainBytecodeHash = sha256Hex(normalized);
          }
        } catch {
          // ignore — keep prev value
        }
      }

      const next: DeployUnitState = {
        ...prev,
        address: address ?? prev.address,
        addresses:
          Object.keys(cfgAddresses).length > 0
            ? { ...(prev.addresses ?? {}), ...cfgAddresses }
            : prev.addresses,
        bytecodeHash: hashes.bytecodeHash ?? prev.bytecodeHash,
        creationCodeHash: hashes.creationCodeHash ?? prev.creationCodeHash,
        onchainBytecodeHash,
      };

      const onchainDrift =
        next.onchainBytecodeHash !== undefined &&
        next.bytecodeHash !== undefined &&
        next.onchainBytecodeHash !== next.bytecodeHash;

      report.push({
        env,
        unit: unit.name,
        address: next.address,
        bytecodeHash: next.bytecodeHash,
        onchainBytecodeHash: next.onchainBytecodeHash,
        artifactMissing: hashes.artifactMissing === true,
        addressChanged: prev.address !== next.address,
        hashChanged: prev.bytecodeHash !== next.bytecodeHash,
        onchainDrift,
      });

      unit.state = next;
    }

    manifest.meta = {
      ...(manifest.meta ?? {}),
      lastPopulatedAt: new Date().toISOString(),
    };

    if (!opts.dryRun) {
      const p = join(manifestDir, `${env}.json`);
      await writeFile(p, JSON.stringify(manifest, null, 2) + "\n", "utf8");
    }
  }

  return report;
}

// ---------- CLI ----------

function parseArgs(argv: string[]): PopulateOptions {
  const opts: PopulateOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") continue; // pnpm forwards the end-of-options sentinel verbatim
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--skip-onchain") opts.skipOnchain = true;
    else if (arg === "--env") {
      const v = argv[++i];
      if (!v) throw new Error("--env requires a value");
      if (!isEnvName(v))
        throw new Error(`Unknown env "${v}". One of: ${ENV_NAMES.join(", ")}`);
      opts.envs = [...(opts.envs ?? []), v];
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

function printHelp(): void {
  console.log(`Usage: populate [options]

Reads forge artifacts + deployment/<bundle>/config.json and writes the current
deployment state into the manifest files under manifest/env/*.json.

Options:
  --env <name>     Restrict to one environment (repeatable). One of:
                     ${ENV_NAMES.join(", ")}
  --dry-run        Don't write files; just print the report.
  --skip-onchain   Don't query the live RPC for on-chain bytecode (offline
                   runs / CI without RPC access).
  -h, --help       Show this help.
`);
}

function shortHash(h: string | undefined): string {
  if (!h) return "—";
  return h.slice(0, 10) + "…";
}

function shortAddr(a: string | undefined): string {
  if (!a) return "—";
  return a.slice(0, 8) + "…" + a.slice(-6);
}

function printReport(report: PopulateReport[]): void {
  const grouped = new Map<EnvName, PopulateReport[]>();
  for (const r of report) {
    const list = grouped.get(r.env) ?? [];
    list.push(r);
    grouped.set(r.env, list);
  }
  for (const [env, rows] of grouped) {
    console.log(`\n# ${env}`);
    for (const r of rows) {
      const flags: string[] = [];
      if (r.artifactMissing) flags.push("ARTIFACT MISSING");
      if (r.addressChanged && r.address) flags.push("addr+");
      if (r.hashChanged && r.bytecodeHash) flags.push("hash+");
      if (r.onchainDrift) flags.push("ONCHAIN DRIFT");
      const flagStr = flags.length ? ` [${flags.join(", ")}]` : "";
      console.log(
        `  ${r.unit.padEnd(36)} addr=${shortAddr(r.address)}  hash=${shortHash(r.bytecodeHash)}  onchain=${shortHash(r.onchainBytecodeHash)}${flagStr}`,
      );
    }
  }
}

// Entry point: only runs when executed directly (not when imported by tests).
const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("populate.ts");

if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  populate(opts).then(
    (report) => {
      printReport(report);
      if (opts.dryRun) console.log("\n(dry-run — no files written)");
    },
    (err) => {
      console.error(err.stack ?? err.message ?? err);
      process.exit(1);
    },
  );
}
