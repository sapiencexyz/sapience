// plan.ts — Phase 2 planner.
//
// Reads each manifest's recorded state and a freshly-computed map of artifact
// hashes, and outputs an ordered list of actions:
//
//   1. DEPLOY items   — units that must be (re)deployed.
//   2. CONFIGURE items — `configureScripts` to run after deploys, including
//                        peer-side reconfiguration triggered by cross-env wiring.
//
// The core (computePlan) is a pure function so tests can inject synthetic
// inputs. The CLI wrapper handles file IO + forge artifact reads.

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertCrossEnvRefs,
  assertManifest,
  ENV_NAMES,
  isEnvName,
  isUnitActive,
  parseUnitRef,
  type DeployUnit,
  type EnvName,
  type Manifest,
  type UnitRef,
} from "./schema.ts";
import { readArtifactHashes } from "./populate.ts";

// ---------- paths (CLI use only) ----------

const HERE = dirname(fileURLToPath(import.meta.url));
const PROTOCOL_ROOT = resolve(HERE, "..", "..");
const MANIFEST_DIR = resolve(HERE, "env");

// ---------- types ----------

export type PlanAction = "deploy" | "configure";

export interface DeployItem {
  kind: "deploy";
  env: EnvName;
  unit: string;
  /** Forge script to run. */
  script: string;
  /** Why this unit is on the plan. */
  reasons: string[];
}

export interface ConfigureItem {
  kind: "configure";
  env: EnvName;
  unit: string;
  /** Single configureScript to run. One ConfigureItem per (unit, script). */
  script: string;
  reasons: string[];
}

export type PlanItem = DeployItem | ConfigureItem;

export interface Plan {
  items: PlanItem[];
  /** Set of units that need redeploy, keyed by canonical UnitRef. */
  dirty: Set<string>;
  /** Set of units that need reconfigure but not redeploy. */
  reconfigure: Set<string>;
}

/** Map UnitRef -> current bytecode hash (undefined if artifact missing). */
export type HashMap = Map<string, string | undefined>;

export interface ComputePlanInput {
  manifests: Partial<Record<EnvName, Manifest>>;
  /** Current artifact bytecode hashes, indexed by canonical UnitRef. */
  currentHashes: HashMap;
  /** Forced redeploys (CLI --force). */
  forced?: Set<string>;
  /**
   * If set, restrict the plan to manifests whose bundle matches. Cross-env
   * propagation (constructorDeps / twinOf / wiringPeers) then stays within
   * the selected bundle. Bundle isolation is also enforced at the schema
   * level by assertCrossEnvRefs.
   */
  bundle?: import("./schema.ts").Bundle;
}

// ---------- helpers ----------

function ref(env: EnvName, unit: string): string {
  return `${env}:${unit}`;
}

function* allUnits(
  manifests: Partial<Record<EnvName, Manifest>>,
): Generator<{ env: EnvName; unit: DeployUnit; ref: string }> {
  for (const env of ENV_NAMES) {
    const m = manifests[env];
    if (!m) continue;
    for (const unit of Object.values(m.units)) {
      // Skip bridge units in a bridge-disabled manifest — they are inert until
      // the bridge is switched on (Manifest.bridgeEnabled).
      if (!isUnitActive(m, unit)) continue;
      yield { env, unit, ref: ref(env, unit.name) };
    }
  }
}

function getUnit(
  manifests: Partial<Record<EnvName, Manifest>>,
  unitRef: string,
): { env: EnvName; unit: DeployUnit } | undefined {
  const { env, unit } = parseUnitRef(unitRef);
  const m = manifests[env];
  if (!m) return undefined;
  const u = m.units[unit];
  if (!u) return undefined;
  if (!isUnitActive(m, u)) return undefined;
  return { env, unit: u };
}

/**
 * Build the inverse `constructorDeps` graph for one env: V -> list of units
 * that list V in their constructorDeps. Used to propagate dirty forward.
 */
function buildDependents(
  manifest: Manifest,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const u of Object.values(manifest.units)) {
    for (const dep of u.constructorDeps) {
      const list = out.get(dep) ?? [];
      list.push(u.name);
      out.set(dep, list);
    }
  }
  return out;
}

/**
 * Build the inverse `stateInvalidatedBy` graph for one env: V -> list of
 * units that declare "if V redeploys, my state is invalidated and I must
 * also redeploy". Same shape as `buildDependents` but driven by a
 * different field; kept separate so reasons are distinguishable in the
 * plan output.
 */
function buildInvalidationDependents(
  manifest: Manifest,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const u of Object.values(manifest.units)) {
    for (const dep of u.stateInvalidatedBy ?? []) {
      const list = out.get(dep) ?? [];
      list.push(u.name);
      out.set(dep, list);
    }
  }
  return out;
}

// ---------- core algorithm ----------

interface DirtyReason {
  ref: string;
  reasons: string[];
}

/**
 * Phase A: seed the dirty set from initial signals.
 *   - state.address missing       => "never deployed"
 *   - on-chain bytecode diverged  => "on-chain bytecode out of date"
 *   - manifest bytecode diverged  => "bytecode changed"
 *   - forced via --force flag     => "forced via --force"
 * Units without an artifact and no prior state are skipped (no signal).
 *
 * The on-chain check (when available) is the authoritative signal: it
 * catches the case where `state.bytecodeHash` was refreshed by populate
 * after a source change but the on-chain code never got redeployed.
 * `state.bytecodeHash` alone is a snapshot — it does not reflect drift.
 */
function seedDirty(input: ComputePlanInput): Map<string, string[]> {
  const seed = new Map<string, string[]>();
  const forced = input.forced ?? new Set<string>();

  for (const { ref, unit } of allUnits(input.manifests)) {
    const reasons: string[] = [];
    const cur = input.currentHashes.get(ref);
    const prevHash = unit.state?.bytecodeHash;
    const onchainHash = unit.state?.onchainBytecodeHash;
    const prevAddr = unit.state?.address;

    if (forced.has(ref)) {
      reasons.push("forced via --force");
    }
    if (!prevAddr) {
      // Never deployed (or address not yet populated). Only consider this
      // dirty if we have an artifact to deploy — otherwise we're not
      // actionable.
      if (cur) reasons.push("never deployed");
    } else if (cur !== undefined && onchainHash !== undefined) {
      // On-chain hash is the authoritative signal — when it's present it
      // supersedes `state.bytecodeHash` entirely (which can be stale).
      if (cur !== onchainHash) {
        reasons.push(
          `on-chain bytecode out of date (on-chain ${onchainHash.slice(0, 10)}… ≠ artifact ${cur.slice(0, 10)}…)`,
        );
      }
    } else if (cur && prevHash && cur !== prevHash) {
      reasons.push(
        `bytecode changed (${prevHash.slice(0, 10)}… → ${cur.slice(0, 10)}…)`,
      );
    }

    if (reasons.length > 0) seed.set(ref, reasons);
  }
  return seed;
}

/**
 * Phase B: propagate dirty across the graph until fixed point.
 *   - constructorDeps:    V dirty => every U with V ∈ U.constructorDeps is dirty
 *   - stateInvalidatedBy: V dirty => every U with V ∈ U.stateInvalidatedBy is dirty
 *   - twinOf:             U dirty => U.twinOf is dirty (and vice-versa)
 * Tracks the reason chain so the report explains WHY each unit ended up dirty.
 */
function propagateDirty(
  input: ComputePlanInput,
  seed: Map<string, string[]>,
): Map<string, string[]> {
  const dirty = new Map(seed); // clone

  // Precompute per-env dependents maps.
  const dependentsByEnv: Partial<Record<EnvName, Map<string, string[]>>> = {};
  const invalidationByEnv: Partial<Record<EnvName, Map<string, string[]>>> = {};
  for (const env of ENV_NAMES) {
    const m = input.manifests[env];
    if (m) {
      dependentsByEnv[env] = buildDependents(m);
      invalidationByEnv[env] = buildInvalidationDependents(m);
    }
  }

  const queue: string[] = [...dirty.keys()];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const got = getUnit(input.manifests, cur);
    if (!got) continue;
    const { env, unit } = got;

    // Forward via constructorDeps: any unit in same env whose constructor
    // takes this one.
    const dependents = dependentsByEnv[env]?.get(unit.name) ?? [];
    for (const depName of dependents) {
      const depRef = ref(env, depName);
      if (!dirty.has(depRef)) {
        dirty.set(depRef, [`depends on ${cur}`]);
        queue.push(depRef);
      }
    }

    // Forward via stateInvalidatedBy: any unit in same env whose
    // accumulated state would be invalidated by this redeploy.
    const invalidated = invalidationByEnv[env]?.get(unit.name) ?? [];
    for (const depName of invalidated) {
      const depRef = ref(env, depName);
      if (!dirty.has(depRef)) {
        dirty.set(depRef, [`state invalidated by ${cur}`]);
        queue.push(depRef);
      }
    }

    // Twin propagation: the twin must redeploy alongside us. twinOf is
    // schema-enforced to be symmetric (assertCrossEnvRefs validates this), so
    // a single forward step is enough — no reverse scan needed.
    if (unit.twinOf && !dirty.has(unit.twinOf)) {
      dirty.set(unit.twinOf, [`twin of ${cur} redeploys`]);
      queue.push(unit.twinOf);
    }
  }

  return dirty;
}

/**
 * Phase C: compute units that need reconfigure (not redeploy) — peers of
 * dirty units. A dirty unit's own configureScripts also run, but those are
 * already accounted for by the deploy step; this set captures the cross-env
 * peers that don't themselves redeploy.
 */
function computeReconfigure(
  input: ComputePlanInput,
  dirty: Map<string, string[]>,
): Map<string, string[]> {
  const reconfigure = new Map<string, string[]>();

  for (const dirtyRef of dirty.keys()) {
    const got = getUnit(input.manifests, dirtyRef);
    if (!got) continue;
    for (const peer of got.unit.wiringPeers) {
      if (dirty.has(peer)) continue; // peer already redeploys (and runs its own configures)
      const reasons = reconfigure.get(peer) ?? [];
      reasons.push(`wiringPeer ${dirtyRef} redeploys`);
      reconfigure.set(peer, reasons);
    }
  }

  return reconfigure;
}

/**
 * Phase D: topological order of deploys within each env (constructorDeps
 * must come first). Between envs: stable alphabetical for determinism.
 */
function topoSortDeploys(
  input: ComputePlanInput,
  dirty: Map<string, string[]>,
): string[] {
  const groups: Partial<Record<EnvName, string[]>> = {};
  for (const ref of dirty.keys()) {
    const { env } = parseUnitRef(ref);
    (groups[env] ??= []).push(ref);
  }

  const ordered: string[] = [];
  for (const env of [...ENV_NAMES].sort()) {
    const refs = groups[env];
    if (!refs || refs.length === 0) continue;
    const manifest = input.manifests[env]!;
    // Kahn's algorithm restricted to the dirty subset.
    const inDirty = new Set(refs);
    const inDegree = new Map<string, number>();
    for (const r of refs) {
      const { unit: name } = parseUnitRef(r);
      const u = manifest.units[name];
      const deps = u.constructorDeps.filter((d) => inDirty.has(ref(env, d)));
      inDegree.set(r, deps.length);
    }
    const ready: string[] = [...refs]
      .filter((r) => inDegree.get(r) === 0)
      .sort(); // deterministic
    const emitted = new Set<string>();
    while (ready.length > 0) {
      const r = ready.shift()!;
      ordered.push(r);
      emitted.add(r);
      const { unit: name } = parseUnitRef(r);
      // Find every dirty unit that lists this one in constructorDeps and
      // decrement.
      for (const candRef of refs) {
        if (emitted.has(candRef) || ready.includes(candRef)) continue;
        const { unit: candName } = parseUnitRef(candRef);
        const cand = manifest.units[candName];
        if (cand.constructorDeps.includes(name)) {
          const remaining = (inDegree.get(candRef) ?? 0) - 1;
          inDegree.set(candRef, remaining);
          if (remaining === 0) ready.push(candRef);
        }
      }
      ready.sort();
    }

    if (emitted.size !== refs.length) {
      const missing = refs.filter((r) => !emitted.has(r));
      throw new Error(
        `Cycle detected in constructorDeps for ${env}: ${missing.join(", ")}`,
      );
    }
  }

  return ordered;
}

/**
 * Compose the final Plan: deploy items first (topological), then configure
 * items (one per configureScript on dirty + reconfigure units).
 */
export function computePlan(input: ComputePlanInput): Plan {
  // Bundle filter: drop manifests from other bundles BEFORE the algorithm
  // runs. Combined with assertCrossEnvRefs's bundle isolation check, this
  // guarantees the plan never includes items from the unselected bundle.
  const effective: ComputePlanInput = input.bundle
    ? {
        ...input,
        manifests: Object.fromEntries(
          Object.entries(input.manifests).filter(
            ([, m]) => m && m.bundle === input.bundle,
          ),
        ) as Partial<Record<EnvName, Manifest>>,
      }
    : input;

  const seed = seedDirty(effective);
  const dirty = propagateDirty(effective, seed);
  const reconfigure = computeReconfigure(effective, dirty);
  const order = topoSortDeploys(effective, dirty);

  const items: PlanItem[] = [];

  // Deploy items
  for (const r of order) {
    const { env, unit } = getUnit(effective.manifests, r)!;
    items.push({
      kind: "deploy",
      env,
      unit: unit.name,
      script: unit.script,
      reasons: dirty.get(r) ?? [],
    });
  }

  // Configure items — for each dirty unit run its own configureScripts; for
  // each reconfigure-only unit, run its configureScripts with the peer reasons.
  function emitConfigure(unitRef: string, reasons: string[]): void {
    const { env, unit } = getUnit(effective.manifests, unitRef)!;
    for (const script of unit.configureScripts) {
      items.push({ kind: "configure", env, unit: unit.name, script, reasons });
    }
  }

  for (const r of order) emitConfigure(r, ["follow-up to deploy"]);
  for (const [r, reasons] of reconfigure) emitConfigure(r, reasons);

  return {
    items,
    dirty: new Set(dirty.keys()),
    reconfigure: new Set(reconfigure.keys()),
  };
}

// ---------- IO wrappers ----------

export async function loadAllManifests(
  manifestDir: string = MANIFEST_DIR,
): Promise<Record<EnvName, Manifest>> {
  const out: Partial<Record<EnvName, Manifest>> = {};
  for (const env of ENV_NAMES) {
    const p = join(manifestDir, `${env}.json`);
    if (!existsSync(p)) continue;
    const raw = JSON.parse(await readFile(p, "utf8"));
    out[env] = assertManifest(raw, p);
  }
  assertCrossEnvRefs(out as Record<EnvName, Manifest | undefined>);
  return out as Record<EnvName, Manifest>;
}

export async function readCurrentHashes(
  manifests: Partial<Record<EnvName, Manifest>>,
  artifactsDir: string,
): Promise<HashMap> {
  const out: HashMap = new Map();
  // Same artifact serves all envs (one out/ per protocol package), but we key
  // by full UnitRef so the planner doesn't need to dedupe.
  const cache = new Map<string, string | undefined>();
  for (const { ref, unit } of allUnits(manifests)) {
    let h = cache.get(unit.contract);
    if (h === undefined && !cache.has(unit.contract)) {
      const hashes = await readArtifactHashes(unit.contract, artifactsDir);
      h = hashes.bytecodeHash;
      cache.set(unit.contract, h);
    }
    out.set(ref, h);
  }
  return out;
}

// ---------- CLI ----------

interface CliOptions {
  json: boolean;
  check: boolean;
  forced: Set<string>;
  manifestDir: string;
  artifactsDir: string;
  bundle?: import("./schema.ts").Bundle;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    json: false,
    check: false,
    forced: new Set(),
    manifestDir: MANIFEST_DIR,
    artifactsDir: resolve(PROTOCOL_ROOT, "out"),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue; // pnpm forwards the end-of-options sentinel verbatim
    if (a === "--json") opts.json = true;
    else if (a === "--check") opts.check = true;
    else if (a === "--bundle") {
      const v = argv[++i];
      if (v !== "testnet" && v !== "mainnet")
        throw new Error(`--bundle must be "testnet" or "mainnet", got "${v}"`);
      opts.bundle = v;
    } else if (a === "--force") {
      const v = argv[++i];
      if (!v) throw new Error("--force requires a unit ref (env:UnitName)");
      const { env } = parseUnitRef(v);
      if (!isEnvName(env)) throw new Error(`Unknown env in --force: ${v}`);
      opts.forced.add(v);
    } else if (a === "--manifest-dir") {
      opts.manifestDir = resolve(argv[++i] ?? "");
    } else if (a === "--artifacts-dir") {
      opts.artifactsDir = resolve(argv[++i] ?? "");
    } else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return opts;
}

function printHelp(): void {
  console.log(`Usage: plan [options]

Compares forge artifacts against the manifest's recorded state and produces a
redeploy + reconfigure plan honouring constructorDeps, twinOf, and wiringPeers
across the selected bundle (or both bundles if none is specified).

Options:
  --bundle <name>      Restrict the plan to one bundle (testnet|mainnet).
                       Omit to see the plan for both bundles at once.
  --force <env:Unit>   Force a unit to be redeployed (repeatable).
  --json               Emit the plan as JSON (for executor consumption).
  --check              Exit non-zero if the plan is non-empty (CI gating).
  --manifest-dir <p>   Override the manifest directory (for tests).
  --artifacts-dir <p>  Override the forge out/ dir (for tests).
  -h, --help           Show this help.
`);
}

function printHuman(plan: Plan): void {
  if (plan.items.length === 0) {
    console.log("✓ No changes — deployment is up to date.");
    return;
  }

  const deploys = plan.items.filter((i): i is DeployItem => i.kind === "deploy");
  const configures = plan.items.filter(
    (i): i is ConfigureItem => i.kind === "configure",
  );

  console.log(`\n=== Plan (${deploys.length} deploys, ${configures.length} configures) ===`);

  if (deploys.length > 0) {
    console.log("\n# Deploys (in order):");
    for (const d of deploys) {
      console.log(`  [${d.env}] ${d.unit}`);
      for (const r of d.reasons) console.log(`    └ ${r}`);
      console.log(`    script: ${d.script}`);
    }
  }

  if (configures.length > 0) {
    console.log("\n# Configures (after all deploys):");
    for (const c of configures) {
      console.log(`  [${c.env}] ${c.unit}`);
      for (const r of c.reasons) console.log(`    └ ${r}`);
      console.log(`    script: ${c.script}`);
    }
  }

  console.log("");
}

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("plan.ts");

if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  (async () => {
    const manifests = await loadAllManifests(opts.manifestDir);
    const currentHashes = await readCurrentHashes(manifests, opts.artifactsDir);

    const bundles: Array<import("./schema.ts").Bundle> = opts.bundle
      ? [opts.bundle]
      : ["testnet", "mainnet"];
    const plans = bundles.map((bundle) => ({
      bundle,
      plan: computePlan({
        manifests,
        currentHashes,
        forced: opts.forced,
        bundle,
      }),
    }));

    if (opts.json) {
      console.log(
        JSON.stringify(
          plans.map(({ bundle, plan }) => ({ bundle, items: plan.items })),
          null,
          2,
        ),
      );
    } else {
      for (const { bundle, plan } of plans) {
        console.log(`\n## bundle: ${bundle}`);
        printHuman(plan);
      }
    }

    if (
      opts.check &&
      plans.some(({ plan }) => plan.items.length > 0)
    )
      process.exit(1);
  })().catch((err) => {
    console.error(err.stack ?? err.message ?? err);
    process.exit(1);
  });
}
