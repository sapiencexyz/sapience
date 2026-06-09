// Manifest schema for Sapience protocol deployments.
//
// A manifest is the authoritative record of WHICH contracts are deployed on a
// given chain, HOW they are deployed (script + dependencies), and the CURRENT
// state (address + bytecode hash). The planner (Phase 2) reads manifests and
// compiled artifacts to decide what to redeploy. populate.ts (Phase 1) only
// fills in the state by reading the existing config.json + forge artifacts.

import { readFile } from "node:fs/promises";

/**
 * Deployment environments. The ethereal/arbitrum/polygon names are inherited
 * from the manifest tooling's origin (the qeng repo) and kept so the ported
 * unit tests stay valid; in THIS repo only the robinhood-* manifests have env
 * files on disk, so loadAllManifests() skips the rest. The Robinhood envs are
 * the active ones here: robinhood-testnet (bundle "testnet") and
 * robinhood-mainnet (bundle "mainnet"). Because each bundle only contains the
 * Robinhood env whose file exists, `apply --bundle testnet` never touches any
 * Ethereal deployment.
 */
export const ENV_NAMES = [
  "ethereal-testnet",
  "arbitrum-sepolia",
  "ethereal-mainnet",
  "polygon",
  "arbitrum",
  "robinhood-testnet",
  "robinhood-mainnet",
] as const;
export type EnvName = (typeof ENV_NAMES)[number];

/** Logical group: testnet vs mainnet. Apply only ever operates on one bundle. */
export type Bundle = "testnet" | "mainnet";

export function isEnvName(s: string): s is EnvName {
  return (ENV_NAMES as readonly string[]).includes(s);
}

/** Fully-qualified reference to a unit in some manifest: "<env>:<unitName>". */
export type UnitRef = `${EnvName}:${string}`;

export function parseUnitRef(ref: string): { env: EnvName; unit: string } {
  const idx = ref.indexOf(":");
  if (idx < 0) throw new Error(`UnitRef missing ':' — got "${ref}"`);
  const env = ref.slice(0, idx);
  const unit = ref.slice(idx + 1);
  if (!isEnvName(env)) throw new Error(`Unknown env in UnitRef "${ref}"`);
  if (!unit) throw new Error(`Empty unit name in UnitRef "${ref}"`);
  return { env, unit };
}

/**
 * Per-produces metadata for a multi-output deploy. When `DeployUnitDef.outputs`
 * is set, verify + sync-sdk treat each produced address as its own
 * (contract, contractPath, sdkExport) tuple — necessary for scripts like
 * DeployCommittedIntent.s.sol that deploy several contracts in one tx.
 */
export interface ProducedOutput {
  /** Solidity contract name for this produced address. */
  contract: string;
  /** Fully-qualified `<path>:<Contract>` argument for `forge verify-contract`. */
  contractPath?: string;
  /** SDK export name (in `packages/sdk/contracts/addresses.ts`) for this address. */
  sdkExport?: string;
}

/** Static definition — versioned in git, hand-edited. */
export interface DeployUnitDef {
  /** Unique name within the manifest. */
  name: string;
  /**
   * Solidity contract name (matches forge artifact dir and file). For
   * multi-output units this is the "primary" contract — the one whose address
   * lands in `state.address` and whose bytecode hash drives the dirty check.
   */
  contract: string;
  /**
   * Fully-qualified `<path>:<Contract>` argument for `forge verify-contract`.
   * Optional: most units derive this naturally from `script`, but verify
   * needs the actual source file location, which can differ (e.g.
   * test/mocks/MockERC20.sol for the test Collateral unit).
   *
   * For multi-output units this is the primary contract's path; per-output
   * paths live in `outputs[k].contractPath`.
   */
  contractPath?: string;
  /** Forge script invocation: "Foo.s.sol:Foo", relative to packages/protocol. */
  script: string;
  /**
   * Env var keys this deploy writes back to config.json. Most units write one
   * (e.g. "FACTORY_ADDRESS"). Multi-output deploys (DeployCommittedIntent) list
   * several.
   */
  produces: string[];
  /**
   * Per-produces metadata. When present, every key MUST also appear in
   * `produces`. Verify treats each `outputs[k]` as its own contract to verify;
   * sync-sdk emits one SDK export per `outputs[k].sdkExport`. Single-output
   * units leave this unset and rely on the unit-level `contract` +
   * `contractPath` + `sdkExport` fields.
   */
  outputs?: Record<string, ProducedOutput>;
  /** Other units in the SAME manifest that must be deployed first. */
  constructorDeps: string[];
  /**
   * Units whose redeploy invalidates this unit's accumulated state, forcing
   * a fresh deploy even when this unit's own source hasn't changed. The
   * inverse-direction cousin of `constructorDeps`: where constructorDeps
   * cascades "V dirty → U dirty (because U's CONSTRUCTOR consumes V)", this
   * cascades the same way for stateful collaborators that don't appear in
   * the constructor but accumulate persistent state tied to the other
   * unit's authority.
   *
   * Canonical example: `PredictionMarketTokenFactory` stores a
   * `pickConfigId → token-pair` mapping populated under the PME that
   * called `createTokens`. A fresh PME with the old Factory would either
   * re-use old PME's tokens (whose mint/burn authority is still the old
   * PME) or collide on the deterministic CREATE3 address — both unsafe.
   * Declaring `stateInvalidatedBy: ["PredictionMarketEscrow"]` on Factory
   * makes the planner redeploy Factory whenever PME does, without needing
   * `--force` at apply time.
   *
   * Same-manifest only (mirrors `constructorDeps`). Cross-env analog is
   * `wiringPeers` (which causes RECONFIGURE, not REDEPLOY).
   */
  stateInvalidatedBy?: string[];
  /**
   * Cross-env wiring peers (LZ bridge peers, CT reader/resolver). When a peer
   * redeploys, this unit needs to RECONFIGURE — not necessarily redeploy.
   */
  wiringPeers: UnitRef[];
  /**
   * CREATE3 twin: this unit and the referenced one MUST share an address via
   * the same salt + deployer EOA. Twin redeploy => this unit MUST redeploy too.
   */
  twinOf?: UnitRef;
  /**
   * Post-deploy configure scripts. Run after this unit deploys OR after any
   * wiringPeer redeploys.
   */
  configureScripts: string[];
  /**
   * Name of the matching `ChainAddressMap` export in
   * `packages/sdk/contracts/addresses.ts`. Two purposes:
   *
   *   1. Populate uses it as a fallback address source when `produces` keys
   *      aren't tracked in `<bundle>/config.json` (resolvers, CT contracts).
   *   2. sync-sdk uses it to know which SDK export to regenerate from this
   *      unit's state. Multiple units sharing an export name combine into
   *      multiple chainId entries on the same export.
   */
  sdkExport?: string;
  /** Free-form description (visible in dry-run output). */
  notes?: string;
}

/** Mutable state — updated by populate.ts (Phase 1) and by the deployer (Phase 3). */
export interface DeployUnitState {
  /**
   * Current on-chain address of the unit's primary contract. For multi-output
   * units this mirrors `addresses[produces[0]]`.
   */
  address?: string;
  /**
   * Addresses for every produced key, keyed by the produces string. Always
   * present on multi-output units; redundant (but populated) on single-output
   * units. The address recorded in `address` is also stored here under
   * `produces[0]`.
   */
  addresses?: Record<string, string>;
  /**
   * sha256 of the artifact's deployedBytecode.object (runtime code) at last
   * deploy time. Reflects what was COMPILED when state.address was deployed,
   * not necessarily what is on-chain right now (that's `onchainBytecodeHash`).
   */
  bytecodeHash?: string;
  /**
   * sha256 of the runtime bytecode currently deployed at `state.address`
   * (live `eth_getCode`, hashed). Populated by `manifest:populate` whenever an
   * RPC URL is available. The planner compares THIS against the freshly-built
   * artifact's deployedBytecode hash to decide if a unit is dirty — that's
   * what catches "source changed but the chain still has the old code".
   */
  onchainBytecodeHash?: string;
  /** sha256 of the artifact's bytecode.object (creation code, incl. constructor). */
  creationCodeHash?: string;
  /** Git SHA the contract was deployed from. */
  gitSha?: string;
  /** ISO-8601 timestamp of the last successful deploy. */
  deployedAt?: string;
  /** Deploy transaction hash. */
  txHash?: string;
  /** CREATE3 salt used (for twin units). */
  salt?: string;
  /** Block number snapshot right before the address was deployed. */
  blockCreated?: number;
  /**
   * Past deployments of this unit, most-recent-first. On every successful
   * apply that produces a NEW address, the previous {address, addresses,
   * blockCreated, deployedAt, gitSha, txHash} are pushed to index 0 of this
   * array and `replacedAt` is set to the new deploy's timestamp.
   */
  legacy?: LegacyDeployEntry[];
}

export interface LegacyDeployEntry {
  address: string;
  /** Per-produces snapshot for multi-output units. */
  addresses?: Record<string, string>;
  blockCreated?: number;
  deployedAt?: string;
  gitSha?: string;
  txHash?: string;
  /** Wall-clock ISO time when this entry was rotated out of `state`. */
  replacedAt?: string;
}

export type DeployUnit = DeployUnitDef & { state?: DeployUnitState };

export interface ManifestChain {
  name: string;
  chainId: number;
  /**
   * Env-var keys the executor reads to invoke forge against this chain. All
   * optional for backwards compatibility — Phase 1/2 tests use minimal
   * fixtures. Phase 3's executor errors out cleanly when these are missing
   * on a real apply.
   */
  rpcUrlEnv?: string;
  deployerPrivateKeyEnv?: string;
  deployerAddressEnv?: string;
  /**
   * How forge should auto-verify deploys on this chain. Optional — if absent,
   * the executor skips `--verify` entirely on this chain.
   */
  verifier?: VerifierConfig;
}

/** Discriminated union of explorer verification configs. */
export type VerifierConfig =
  | {
      kind: "blockscout";
      /** Env-var that holds the Blockscout API URL (e.g. PM_NETWORK_EXPLORER_URL). */
      explorerUrlEnv: string;
    }
  | {
      kind: "etherscan";
      /** Env-var that holds the Etherscan-style API key (e.g. SM_NETWORK_ETHERSCAN_API_KEY). */
      apiKeyEnv: string;
    };

export interface Manifest {
  env: EnvName;
  chain: ManifestChain;
  /**
   * Which bundle this manifest is part of. testnet bundle pairs
   * ethereal-testnet with arbitrum-sepolia. mainnet bundle pairs
   * ethereal-mainnet with arbitrum (Arbitrum One) and polygon.
   * Cross-bundle wiringPeers / twinOf are rejected at load time.
   */
  bundle: Bundle;
  /**
   * Whether the LayerZero bridge / cross-chain units in this manifest are
   * active. Defaults to true when omitted. When explicitly `false`, every
   * bridge unit (see `isBridgeUnit`) is treated as if it weren't in the
   * manifest: the planner skips it and `assertCrossEnvRefs` does not enforce
   * its wiringPeers/twinOf symmetry. This lets an environment be deployed
   * standalone (no bridge) now and have the bridge switched on later by
   * flipping this flag — without restructuring the manifest. Robinhood ships
   * with `bridgeEnabled: false` until LayerZero is available on that chain.
   */
  bridgeEnabled?: boolean;
  /** Map of unit name -> definition + state. */
  units: Record<string, DeployUnit>;
  /** Free-form metadata (last populate timestamp, etc). */
  meta?: Record<string, unknown>;
}

/**
 * A unit is a "bridge" / cross-chain unit when it is coupled to another chain
 * — i.e. it has a CREATE3 twin or one or more LZ wiring peers. These are
 * exactly the units that cannot be deployed without their counterpart chain,
 * so they are the ones gated by `Manifest.bridgeEnabled`.
 */
export function isBridgeUnit(unit: DeployUnit): boolean {
  return Boolean(unit.twinOf) || unit.wiringPeers.length > 0;
}

/**
 * Whether a unit participates in planning/validation for its manifest. False
 * only when the manifest disables the bridge and the unit is a bridge unit.
 * Callers (planner, cross-env validation) skip inactive units entirely.
 */
export function isUnitActive(manifest: Manifest, unit: DeployUnit): boolean {
  return !(manifest.bridgeEnabled === false && isBridgeUnit(unit));
}

// ---------- validation ----------

class ManifestError extends Error {
  constructor(msg: string, public path: string) {
    super(`${msg} (in ${path})`);
  }
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(isString);
}

function assertUnit(name: string, raw: unknown, path: string): DeployUnit {
  if (!raw || typeof raw !== "object")
    throw new ManifestError(`unit "${name}" is not an object`, path);
  const u = raw as Record<string, unknown>;
  if (!isString(u.name)) throw new ManifestError(`unit "${name}".name missing`, path);
  if (u.name !== name)
    throw new ManifestError(
      `unit key "${name}" does not match unit.name "${u.name}"`,
      path,
    );
  if (!isString(u.contract))
    throw new ManifestError(`unit "${name}".contract missing`, path);
  if (u.contractPath !== undefined && !isString(u.contractPath))
    throw new ManifestError(`unit "${name}".contractPath must be string`, path);
  if (!isString(u.script))
    throw new ManifestError(`unit "${name}".script missing`, path);
  if (!isStringArray(u.produces))
    throw new ManifestError(`unit "${name}".produces must be string[]`, path);
  if (!isStringArray(u.constructorDeps))
    throw new ManifestError(
      `unit "${name}".constructorDeps must be string[]`,
      path,
    );
  if (u.stateInvalidatedBy !== undefined && !isStringArray(u.stateInvalidatedBy))
    throw new ManifestError(
      `unit "${name}".stateInvalidatedBy must be string[] when present`,
      path,
    );
  if (!isStringArray(u.wiringPeers))
    throw new ManifestError(`unit "${name}".wiringPeers must be string[]`, path);
  for (const peer of u.wiringPeers) parseUnitRef(peer);
  if (u.twinOf !== undefined) {
    if (!isString(u.twinOf))
      throw new ManifestError(`unit "${name}".twinOf must be string`, path);
    parseUnitRef(u.twinOf);
  }
  if (!isStringArray(u.configureScripts))
    throw new ManifestError(
      `unit "${name}".configureScripts must be string[]`,
      path,
    );
  if (u.sdkExport !== undefined && !isString(u.sdkExport))
    throw new ManifestError(`unit "${name}".sdkExport must be string`, path);
  if (u.notes !== undefined && !isString(u.notes))
    throw new ManifestError(`unit "${name}".notes must be string`, path);

  let outputs: Record<string, ProducedOutput> | undefined;
  if (u.outputs !== undefined) {
    if (!u.outputs || typeof u.outputs !== "object" || Array.isArray(u.outputs))
      throw new ManifestError(
        `unit "${name}".outputs must be an object`,
        path,
      );
    outputs = {};
    for (const [outKey, raw] of Object.entries(
      u.outputs as Record<string, unknown>,
    )) {
      if (!u.produces.includes(outKey))
        throw new ManifestError(
          `unit "${name}".outputs key "${outKey}" is not listed in produces`,
          path,
        );
      if (!raw || typeof raw !== "object")
        throw new ManifestError(
          `unit "${name}".outputs[${outKey}] must be an object`,
          path,
        );
      const o = raw as Record<string, unknown>;
      if (!isString(o.contract))
        throw new ManifestError(
          `unit "${name}".outputs[${outKey}].contract must be string`,
          path,
        );
      if (o.contractPath !== undefined && !isString(o.contractPath))
        throw new ManifestError(
          `unit "${name}".outputs[${outKey}].contractPath must be string`,
          path,
        );
      if (o.sdkExport !== undefined && !isString(o.sdkExport))
        throw new ManifestError(
          `unit "${name}".outputs[${outKey}].sdkExport must be string`,
          path,
        );
      outputs[outKey] = {
        contract: o.contract,
        contractPath: o.contractPath as string | undefined,
        sdkExport: o.sdkExport as string | undefined,
      };
    }
  }

  if (u.state !== undefined) {
    if (!u.state || typeof u.state !== "object")
      throw new ManifestError(`unit "${name}".state must be object`, path);
    const s = u.state as Record<string, unknown>;
    if (s.addresses !== undefined) {
      if (
        !s.addresses ||
        typeof s.addresses !== "object" ||
        Array.isArray(s.addresses)
      )
        throw new ManifestError(
          `unit "${name}".state.addresses must be an object`,
          path,
        );
      for (const [k, v] of Object.entries(s.addresses)) {
        if (!isString(v))
          throw new ManifestError(
            `unit "${name}".state.addresses[${k}] must be string`,
            path,
          );
      }
    }
    if (s.legacy !== undefined) {
      if (!Array.isArray(s.legacy))
        throw new ManifestError(
          `unit "${name}".state.legacy must be array`,
          path,
        );
      for (const entry of s.legacy) {
        if (!entry || typeof entry !== "object")
          throw new ManifestError(
            `unit "${name}".state.legacy entries must be objects`,
            path,
          );
        const e = entry as Record<string, unknown>;
        if (!isString(e.address))
          throw new ManifestError(
            `unit "${name}".state.legacy[].address must be string`,
            path,
          );
        if (e.addresses !== undefined) {
          if (
            !e.addresses ||
            typeof e.addresses !== "object" ||
            Array.isArray(e.addresses)
          )
            throw new ManifestError(
              `unit "${name}".state.legacy[].addresses must be an object`,
              path,
            );
          for (const [k, v] of Object.entries(e.addresses)) {
            if (!isString(v))
              throw new ManifestError(
                `unit "${name}".state.legacy[].addresses[${k}] must be string`,
                path,
              );
          }
        }
      }
    }
    if (s.blockCreated !== undefined && typeof s.blockCreated !== "number")
      throw new ManifestError(
        `unit "${name}".state.blockCreated must be number`,
        path,
      );
  }

  return {
    name: u.name,
    contract: u.contract,
    contractPath: u.contractPath as string | undefined,
    script: u.script,
    produces: u.produces,
    outputs,
    constructorDeps: u.constructorDeps,
    stateInvalidatedBy: u.stateInvalidatedBy as string[] | undefined,
    wiringPeers: u.wiringPeers as UnitRef[],
    twinOf: u.twinOf as UnitRef | undefined,
    configureScripts: u.configureScripts,
    sdkExport: u.sdkExport as string | undefined,
    notes: u.notes,
    state: u.state as DeployUnitState | undefined,
  };
}

export function assertManifest(raw: unknown, path: string): Manifest {
  if (!raw || typeof raw !== "object")
    throw new ManifestError("manifest is not an object", path);
  const m = raw as Record<string, unknown>;
  if (!isString(m.env) || !isEnvName(m.env))
    throw new ManifestError(`manifest.env must be one of ${ENV_NAMES.join("|")}`, path);
  if (m.bundle !== "testnet" && m.bundle !== "mainnet")
    throw new ManifestError(`manifest.bundle must be "testnet" or "mainnet"`, path);
  if (m.bridgeEnabled !== undefined && typeof m.bridgeEnabled !== "boolean")
    throw new ManifestError(`manifest.bridgeEnabled must be boolean when present`, path);
  if (!m.chain || typeof m.chain !== "object")
    throw new ManifestError("manifest.chain missing", path);
  const c = m.chain as Record<string, unknown>;
  if (!isString(c.name)) throw new ManifestError("chain.name missing", path);
  if (typeof c.chainId !== "number")
    throw new ManifestError("chain.chainId must be number", path);
  if (!m.units || typeof m.units !== "object")
    throw new ManifestError("manifest.units missing", path);

  const units: Record<string, DeployUnit> = {};
  for (const [name, raw] of Object.entries(m.units as Record<string, unknown>)) {
    units[name] = assertUnit(name, raw, path);
  }

  // Cross-check intra-env references.
  for (const unit of Object.values(units)) {
    for (const dep of unit.constructorDeps) {
      if (!units[dep])
        throw new ManifestError(
          `unit "${unit.name}".constructorDeps references unknown unit "${dep}"`,
          path,
        );
    }
    for (const dep of unit.stateInvalidatedBy ?? []) {
      if (!units[dep])
        throw new ManifestError(
          `unit "${unit.name}".stateInvalidatedBy references unknown unit "${dep}"`,
          path,
        );
    }
  }

  // Validate verifier config shape if present.
  let verifier: VerifierConfig | undefined;
  if (c.verifier !== undefined) {
    if (!c.verifier || typeof c.verifier !== "object")
      throw new ManifestError("chain.verifier must be object", path);
    const v = c.verifier as Record<string, unknown>;
    if (v.kind === "blockscout") {
      if (!isString(v.explorerUrlEnv))
        throw new ManifestError(
          "chain.verifier.explorerUrlEnv must be string (kind=blockscout)",
          path,
        );
      verifier = { kind: "blockscout", explorerUrlEnv: v.explorerUrlEnv };
    } else if (v.kind === "etherscan") {
      if (!isString(v.apiKeyEnv))
        throw new ManifestError(
          "chain.verifier.apiKeyEnv must be string (kind=etherscan)",
          path,
        );
      verifier = { kind: "etherscan", apiKeyEnv: v.apiKeyEnv };
    } else {
      throw new ManifestError(
        `chain.verifier.kind must be "blockscout" or "etherscan"`,
        path,
      );
    }
  }

  return {
    env: m.env,
    chain: {
      name: c.name,
      chainId: c.chainId,
      rpcUrlEnv: c.rpcUrlEnv as string | undefined,
      deployerPrivateKeyEnv: c.deployerPrivateKeyEnv as string | undefined,
      deployerAddressEnv: c.deployerAddressEnv as string | undefined,
      verifier,
    },
    bundle: m.bundle,
    bridgeEnabled: m.bridgeEnabled as boolean | undefined,
    units,
    meta: m.meta as Record<string, unknown> | undefined,
  };
}

export async function loadManifest(path: string): Promise<Manifest> {
  const raw = JSON.parse(await readFile(path, "utf8"));
  return assertManifest(raw, path);
}

/**
 * Validate cross-env references across a set of loaded manifests. Enforces:
 *
 *   - No dangling `wiringPeers` / `twinOf` pointers.
 *   - `wiringPeers` symmetry: if A lists B as peer, B must list A.
 *   - `twinOf` symmetry: if A.twinOf=B, then B.twinOf must=A. Without this,
 *     three units sharing a twin target would collapse into an implicit
 *     equivalence class and propagate dirtiness across unrelated bundles.
 *   - Bundle isolation: a twinOf / wiringPeers reference can never cross
 *     bundle boundaries. Testnet and mainnet are independent deployments.
 *
 * Run after loading all manifests.
 */
export function assertCrossEnvRefs(manifests: Record<EnvName, Manifest | undefined>): void {
  const get = (env: EnvName, unit: string) => manifests[env]?.units[unit];
  const bundleOf = (env: EnvName): Bundle | undefined => manifests[env]?.bundle;

  for (const m of Object.values(manifests)) {
    if (!m) continue;
    for (const unit of Object.values(m.units)) {
      // Bridge-disabled manifests carry their bridge units inertly: skip their
      // cross-env symmetry checks so a standalone deploy (no counterpart chain)
      // doesn't fail validation on dangling/asymmetric wiringPeers/twinOf.
      if (!isUnitActive(m, unit)) continue;
      const selfRef = `${m.env}:${unit.name}`;

      for (const peer of unit.wiringPeers) {
        const { env, unit: peerName } = parseUnitRef(peer);
        const peerUnit = get(env, peerName);
        if (!peerUnit)
          throw new Error(
            `${selfRef}.wiringPeers references missing unit ${peer}`,
          );
        const peerBundle = bundleOf(env);
        if (peerBundle && peerBundle !== m.bundle)
          throw new Error(
            `${selfRef}.wiringPeers references ${peer} but they are in different bundles (${m.bundle} vs ${peerBundle}) — bundles must stay isolated`,
          );
        if (!peerUnit.wiringPeers.includes(selfRef as UnitRef))
          throw new Error(
            `${selfRef}.wiringPeers references ${peer}, but ${peer}.wiringPeers does not include ${selfRef} — wiringPeers must be symmetric`,
          );
      }

      if (unit.twinOf) {
        const { env, unit: twinName } = parseUnitRef(unit.twinOf);
        const twin = get(env, twinName);
        if (!twin)
          throw new Error(
            `${selfRef}.twinOf references missing unit ${unit.twinOf}`,
          );
        const twinBundle = bundleOf(env);
        if (twinBundle && twinBundle !== m.bundle)
          throw new Error(
            `${selfRef}.twinOf = ${unit.twinOf} but they are in different bundles (${m.bundle} vs ${twinBundle}) — bundles must stay isolated`,
          );
        if (twin.twinOf !== selfRef)
          throw new Error(
            `${selfRef}.twinOf = ${unit.twinOf}, but ${unit.twinOf}.twinOf = ${twin.twinOf ?? "(unset)"} — twinOf must be symmetric`,
          );
      }
    }
  }
}
