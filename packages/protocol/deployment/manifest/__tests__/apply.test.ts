import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  applyPlan,
  buildVerifyArgs,
  factorySaltFor,
  parseProducedAddress,
  validateDeployer,
  type ApplyDeps,
  type ApplyOptions,
  type ForgeRunner,
} from "../apply.ts";
import type { ConfigureItem, DeployItem, PlanItem } from "../plan.ts";
import type { DeployUnit, EnvName, Manifest, VerifierConfig } from "../schema.ts";

// ---------- fixtures ----------

function unit(
  name: string,
  overrides: Partial<DeployUnit> = {},
): DeployUnit {
  return {
    name,
    contract: name,
    script: `src/scripts/Deploy${name}.s.sol:Deploy${name}`,
    produces: [`${name.toUpperCase()}_ADDRESS`],
    constructorDeps: [],
    wiringPeers: [],
    configureScripts: [],
    ...overrides,
  };
}

function manifest(
  env: EnvName,
  bundle: "testnet" | "mainnet",
  units: DeployUnit[],
): Manifest {
  return {
    env,
    bundle,
    chain: {
      name: env,
      chainId: 1,
      rpcUrlEnv: "RPC_URL",
      deployerPrivateKeyEnv: "DEPLOYER_PK",
    },
    units: Object.fromEntries(units.map((u) => [u.name, u])),
  };
}

function deployItem(env: EnvName, u: DeployUnit, reasons: string[] = []): DeployItem {
  return {
    kind: "deploy",
    env,
    unit: u.name,
    script: u.script,
    reasons,
  };
}

function configureItem(
  env: EnvName,
  u: DeployUnit,
  script: string,
  reasons: string[] = [],
): ConfigureItem {
  return { kind: "configure", env, unit: u.name, script, reasons };
}

interface RecordedCall {
  script: string;
  rpcUrl: string;
  privateKey: string;
  broadcast: boolean;
  extraArgs: string[];
  env: Record<string, string>;
}

interface ForgeStub {
  runner: ForgeRunner;
  calls: RecordedCall[];
}

/** Forge stub that returns predefined outputs keyed by script. */
function makeForgeStub(
  outputs: Record<string, { stdout?: string; exitCode?: number; stderr?: string }>,
): ForgeStub {
  const calls: RecordedCall[] = [];
  const runner: ForgeRunner = async (inv) => {
    calls.push({
      script: inv.script,
      rpcUrl: inv.rpcUrl,
      privateKey: inv.privateKey,
      broadcast: inv.broadcast,
      extraArgs: inv.extraArgs ?? [],
      env: { ...inv.env },
    });
    const o = outputs[inv.script] ?? {};
    return {
      stdout: o.stdout ?? "",
      stderr: o.stderr ?? "",
      exitCode: o.exitCode ?? 0,
    };
  };
  return { runner, calls };
}

interface DepsStub extends ApplyDeps {
  persistedManifests: Array<{ env: EnvName; manifest: Manifest }>;
  persistedConfigs: Array<{
    bundle: "testnet" | "mainnet";
    config: Record<string, unknown>;
  }>;
}

function makeDeps(
  runner: ForgeRunner,
  overrides: Partial<ApplyDeps> = {},
): DepsStub {
  const persistedManifests: Array<{ env: EnvName; manifest: Manifest }> = [];
  const persistedConfigs: Array<{
    bundle: "testnet" | "mainnet";
    config: Record<string, unknown>;
  }> = [];
  const deps: DepsStub = {
    resolveEnv: () => ({
      RPC_URL: "https://stub.rpc",
      DEPLOYER_PK: "0xdeadbeef",
    }),
    runForge: runner,
    persistManifest: async (env, m) => {
      // Deep clone so subsequent mutations don't affect the recorded snapshot.
      persistedManifests.push({ env, manifest: JSON.parse(JSON.stringify(m)) });
    },
    persistConfig: async (bundle, c) => {
      persistedConfigs.push({ bundle, config: JSON.parse(JSON.stringify(c)) });
    },
    gitSha: async () => "abc1234",
    now: () => new Date("2026-05-13T12:00:00Z"),
    bytecodeHashFor: async () => "0xcurrenthash",
    persistedManifests,
    persistedConfigs,
    ...overrides,
  };
  return deps;
}

const STDOUT_FACTORY = `
== Logs ==
  FACTORY_ADDRESS= 0xda16846B0F1A0C5292ed0177B343470E364C27F3
`;

const STDOUT_BRIDGE = `
== Logs ==
  PM_NETWORK_BRIDGE_ADDRESS= 0xa3a266CbC9E7dbf358A70Ffe21d3d6C929913329
`;

const STDOUT_CONFIGURE = "== Logs ==\n  Configured successfully.\n";

// ---------- parseProducedAddress ----------

describe("parseProducedAddress", () => {
  it("matches forge's '  KEY= 0x...' output style", () => {
    const out = "  FACTORY_ADDRESS= 0x1234567890123456789012345678901234567890\n";
    assert.equal(
      parseProducedAddress(out, "FACTORY_ADDRESS"),
      "0x1234567890123456789012345678901234567890",
    );
  });

  it("returns undefined when the key is absent", () => {
    assert.equal(parseProducedAddress("nothing here", "FOO"), undefined);
  });

  it("does not match partial-key collisions", () => {
    const out = "  PYTH_CONDITION_RESOLVER_ADDRESS= 0xabcd000000000000000000000000000000000000\n";
    assert.equal(parseProducedAddress(out, "RESOLVER_ADDRESS"), undefined);
  });
});

// ---------- applyPlan basics ----------

describe("applyPlan — deploy items", () => {
  it("invokes forge for each deploy item and persists state", async () => {
    const factory = unit("Factory", { produces: ["FACTORY_ADDRESS"] });
    const m: Manifest = manifest("ethereal-testnet", "testnet", [factory]);
    const items: PlanItem[] = [
      deployItem("ethereal-testnet", factory, ["forced"]),
    ];

    const { runner, calls } = makeForgeStub({
      [factory.script]: { stdout: STDOUT_FACTORY },
    });
    const deps = makeDeps(runner);

    const opts: ApplyOptions = {
      manifests: { "ethereal-testnet": m } as Record<EnvName, Manifest>,
      configs: { testnet: {} },
      items,
    };
    const results = await applyPlan(opts, deps);

    assert.equal(results.length, 1);
    assert.equal(results[0].status, "success");
    assert.deepEqual(results[0].addresses, {
      FACTORY_ADDRESS: "0xda16846B0F1A0C5292ed0177B343470E364C27F3",
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].script, factory.script);
    assert.equal(calls[0].broadcast, true);

    // Manifest state was updated and persisted.
    assert.equal(
      m.units.Factory.state?.address,
      "0xda16846B0F1A0C5292ed0177B343470E364C27F3",
    );
    assert.equal(m.units.Factory.state?.bytecodeHash, "0xcurrenthash");
    // The freshly-deployed code IS the current artifact, so the planner's
    // on-chain-drift signal is synced too (until populate refreshes it).
    assert.equal(m.units.Factory.state?.onchainBytecodeHash, "0xcurrenthash");
    assert.equal(m.units.Factory.state?.gitSha, "abc1234");
    assert.equal(m.units.Factory.state?.deployedAt, "2026-05-13T12:00:00.000Z");
    assert.equal(deps.persistedManifests.length, 1);

    // Config.json was updated and persisted.
    assert.equal(
      opts.configs.testnet?.FACTORY_ADDRESS,
      "0xda16846B0F1A0C5292ed0177B343470E364C27F3",
    );
    assert.equal(deps.persistedConfigs.length, 1);
  });

  it("writes every produces key for multi-produces units", async () => {
    const multi = unit("CommittedIntent", {
      produces: [
        "COMMITTED_INTENT_EXECUTOR_ADDRESS",
        "PRE_MINT_ESCROW_ADDRESS",
        "INSURANCE_POOL_ADDRESS",
      ],
    });
    const stdout = `
  COMMITTED_INTENT_EXECUTOR_ADDRESS= 0x1111111111111111111111111111111111111111
  PRE_MINT_ESCROW_ADDRESS= 0x2222222222222222222222222222222222222222
  INSURANCE_POOL_ADDRESS= 0x3333333333333333333333333333333333333333
`;
    const m = manifest("ethereal-testnet", "testnet", [multi]);
    const { runner } = makeForgeStub({ [multi.script]: { stdout } });
    const deps = makeDeps(runner);
    const opts: ApplyOptions = {
      manifests: { "ethereal-testnet": m } as Record<EnvName, Manifest>,
      configs: { testnet: {} },
      items: [deployItem("ethereal-testnet", multi)],
    };

    const results = await applyPlan(opts, deps);
    assert.equal(results[0].status, "success");
    assert.deepEqual(results[0].addresses, {
      COMMITTED_INTENT_EXECUTOR_ADDRESS:
        "0x1111111111111111111111111111111111111111",
      PRE_MINT_ESCROW_ADDRESS: "0x2222222222222222222222222222222222222222",
      INSURANCE_POOL_ADDRESS: "0x3333333333333333333333333333333333333333",
    });
    // Primary address = first produces key.
    assert.equal(
      m.units.CommittedIntent.state?.address,
      "0x1111111111111111111111111111111111111111",
    );
    // All keys mirrored into state.addresses.
    assert.deepEqual(m.units.CommittedIntent.state?.addresses, {
      COMMITTED_INTENT_EXECUTOR_ADDRESS:
        "0x1111111111111111111111111111111111111111",
      PRE_MINT_ESCROW_ADDRESS: "0x2222222222222222222222222222222222222222",
      INSURANCE_POOL_ADDRESS: "0x3333333333333333333333333333333333333333",
    });
    // All keys in config.
    assert.equal(
      opts.configs.testnet?.PRE_MINT_ESCROW_ADDRESS,
      "0x2222222222222222222222222222222222222222",
    );
  });

  it("rotates a multi-produces unit's prev addresses into legacy[0]", async () => {
    const multi = unit("CommittedIntent", {
      produces: ["EXEC_ADDRESS", "POOL_ADDRESS"],
    });
    const stdout = `
  EXEC_ADDRESS= 0x4444444444444444444444444444444444444444
  POOL_ADDRESS= 0x5555555555555555555555555555555555555555
`;
    const m = manifest("ethereal-testnet", "testnet", [
      {
        ...multi,
        state: {
          address: "0x1111111111111111111111111111111111111111",
          addresses: {
            EXEC_ADDRESS: "0x1111111111111111111111111111111111111111",
            POOL_ADDRESS: "0x2222222222222222222222222222222222222222",
          },
          blockCreated: 100,
        },
      },
    ]);
    const { runner } = makeForgeStub({ [multi.script]: { stdout } });
    const deps = makeDeps(runner);
    const opts: ApplyOptions = {
      manifests: { "ethereal-testnet": m } as Record<EnvName, Manifest>,
      configs: { testnet: {} },
      items: [deployItem("ethereal-testnet", multi)],
    };
    const results = await applyPlan(opts, deps);
    assert.equal(results[0].status, "success");
    const legacy = m.units.CommittedIntent.state?.legacy;
    assert.equal(legacy?.length, 1);
    assert.equal(legacy?.[0].address, "0x1111111111111111111111111111111111111111");
    assert.deepEqual(legacy?.[0].addresses, {
      EXEC_ADDRESS: "0x1111111111111111111111111111111111111111",
      POOL_ADDRESS: "0x2222222222222222222222222222222222222222",
    });
  });
});

describe("applyPlan — configure items", () => {
  it("runs forge but does not update state", async () => {
    const factory = unit("Factory");
    const m = manifest("ethereal-testnet", "testnet", [
      { ...factory, state: { address: "0xexisting", bytecodeHash: "0xh1" } },
    ]);
    const script = "src/scripts/ConfigureFactory.s.sol:ConfigureFactory";
    const { runner } = makeForgeStub({ [script]: { stdout: STDOUT_CONFIGURE } });
    const deps = makeDeps(runner);
    const opts: ApplyOptions = {
      manifests: { "ethereal-testnet": m } as Record<EnvName, Manifest>,
      configs: { testnet: {} },
      items: [configureItem("ethereal-testnet", factory, script)],
    };

    const results = await applyPlan(opts, deps);
    assert.equal(results[0].status, "success");
    // Configure should not persist manifest/config.
    assert.equal(deps.persistedManifests.length, 0);
    assert.equal(deps.persistedConfigs.length, 0);
    // Address unchanged.
    assert.equal(m.units.Factory.state?.address, "0xexisting");
  });
});

describe("applyPlan — OUTPUT_KEY injection", () => {
  it("injects OUTPUT_KEY = unit.produces[0] into the forge env", async () => {
    const pyth = unit("PythVault", { produces: ["PYTH_VAULT_ADDRESS"] });
    const m = manifest("ethereal-testnet", "testnet", [pyth]);
    const stdout = `
  PYTH_VAULT_ADDRESS= 0x4444444444444444444444444444444444444444
`;
    const { runner, calls } = makeForgeStub({ [pyth.script]: { stdout } });
    const deps = makeDeps(runner);
    const opts: ApplyOptions = {
      manifests: { "ethereal-testnet": m } as Record<EnvName, Manifest>,
      configs: { testnet: {} },
      items: [deployItem("ethereal-testnet", pyth)],
    };
    const results = await applyPlan(opts, deps);
    assert.equal(results[0].status, "success");
    assert.equal(calls[0].env.OUTPUT_KEY, "PYTH_VAULT_ADDRESS");
  });

  it("uses the FIRST produces key when the unit lists multiple", async () => {
    const stack = unit("CommittedIntent", {
      produces: [
        "COMMITTED_INTENT_EXECUTOR_ADDRESS",
        "PRE_MINT_ESCROW_ADDRESS",
      ],
    });
    const m = manifest("ethereal-testnet", "testnet", [stack]);
    const stdout = `
  COMMITTED_INTENT_EXECUTOR_ADDRESS= 0x1111111111111111111111111111111111111111
  PRE_MINT_ESCROW_ADDRESS= 0x2222222222222222222222222222222222222222
`;
    const { runner, calls } = makeForgeStub({ [stack.script]: { stdout } });
    const deps = makeDeps(runner);
    const opts: ApplyOptions = {
      manifests: { "ethereal-testnet": m } as Record<EnvName, Manifest>,
      configs: { testnet: {} },
      items: [deployItem("ethereal-testnet", stack)],
    };
    await applyPlan(opts, deps);
    assert.equal(calls[0].env.OUTPUT_KEY, "COMMITTED_INTENT_EXECUTOR_ADDRESS");
  });
});

describe("applyPlan — failure paths", () => {
  it("halts on first failure by default", async () => {
    const a = unit("A");
    const b = unit("B");
    const m = manifest("ethereal-testnet", "testnet", [a, b]);
    const { runner, calls } = makeForgeStub({
      [a.script]: { exitCode: 1, stderr: "boom" },
      [b.script]: { stdout: STDOUT_FACTORY },
    });
    const deps = makeDeps(runner);
    const opts: ApplyOptions = {
      manifests: { "ethereal-testnet": m } as Record<EnvName, Manifest>,
      configs: { testnet: {} },
      items: [
        deployItem("ethereal-testnet", a),
        deployItem("ethereal-testnet", b),
      ],
    };

    const results = await applyPlan(opts, deps);
    assert.equal(results.length, 1);
    assert.equal(results[0].status, "failure");
    assert.equal(calls.length, 1, "second item should never run");
  });

  it("with --continue-on-error keeps going after a failure", async () => {
    const a = unit("A");
    const b = unit("B");
    const m = manifest("ethereal-testnet", "testnet", [a, b]);
    const { runner, calls } = makeForgeStub({
      [a.script]: { exitCode: 1, stderr: "boom" },
      [b.script]: {
        stdout: "  B_ADDRESS= 0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    });
    const deps = makeDeps(runner);
    const opts: ApplyOptions = {
      manifests: { "ethereal-testnet": m } as Record<EnvName, Manifest>,
      configs: { testnet: {} },
      items: [
        deployItem("ethereal-testnet", a),
        deployItem("ethereal-testnet", b),
      ],
      continueOnError: true,
    };

    const results = await applyPlan(opts, deps);
    assert.equal(results.length, 2);
    assert.equal(results[0].status, "failure");
    assert.equal(results[1].status, "success");
    assert.equal(calls.length, 2);
  });

  it("fails cleanly when forge succeeds but the expected key isn't in stdout", async () => {
    const a = unit("A", { produces: ["A_ADDRESS"] });
    const m = manifest("ethereal-testnet", "testnet", [a]);
    const { runner } = makeForgeStub({
      [a.script]: { stdout: "no produced key in here" },
    });
    const deps = makeDeps(runner);
    const opts: ApplyOptions = {
      manifests: { "ethereal-testnet": m } as Record<EnvName, Manifest>,
      configs: { testnet: {} },
      items: [deployItem("ethereal-testnet", a)],
    };

    const results = await applyPlan(opts, deps);
    assert.equal(results[0].status, "failure");
    assert.match(results[0].error ?? "", /produced-address key "A_ADDRESS" not found/);
    assert.equal(deps.persistedManifests.length, 0);
  });

  it("fails before invoking forge when env vars are missing", async () => {
    const a = unit("A");
    const m = manifest("ethereal-testnet", "testnet", [a]);
    const { runner, calls } = makeForgeStub({});
    const deps = makeDeps(runner, {
      resolveEnv: () => ({}), // no RPC_URL or DEPLOYER_PK
    });
    const opts: ApplyOptions = {
      manifests: { "ethereal-testnet": m } as Record<EnvName, Manifest>,
      configs: { testnet: {} },
      items: [deployItem("ethereal-testnet", a)],
    };

    const results = await applyPlan(opts, deps);
    assert.equal(results[0].status, "failure");
    assert.match(results[0].error ?? "", /env var RPC_URL not set/);
    assert.equal(calls.length, 0);
  });
});

describe("applyPlan — dry-run", () => {
  it("never invokes forge or persists anything", async () => {
    const a = unit("A");
    const m = manifest("ethereal-testnet", "testnet", [a]);
    const { runner, calls } = makeForgeStub({
      [a.script]: { stdout: STDOUT_FACTORY },
    });
    const deps = makeDeps(runner);
    const opts: ApplyOptions = {
      manifests: { "ethereal-testnet": m } as Record<EnvName, Manifest>,
      configs: { testnet: {} },
      items: [deployItem("ethereal-testnet", a)],
      dryRun: true,
    };

    const results = await applyPlan(opts, deps);
    assert.equal(results.length, 1);
    assert.equal(results[0].status, "skipped-dry-run");
    assert.equal(calls.length, 0);
    assert.equal(deps.persistedManifests.length, 0);
    assert.equal(deps.persistedConfigs.length, 0);
    assert.equal(m.units.A.state, undefined);
  });

  it("does NOT require the deployer env vars (dry-run is preview-only)", async () => {
    const a = unit("A");
    const m = manifest("ethereal-testnet", "testnet", [a]);
    const { runner, calls } = makeForgeStub({});
    const deps = makeDeps(runner, {
      // Empty env — no RPC_URL, no DEPLOYER_PK.
      resolveEnv: () => ({}),
    });
    const opts: ApplyOptions = {
      manifests: { "ethereal-testnet": m } as Record<EnvName, Manifest>,
      configs: { testnet: {} },
      items: [deployItem("ethereal-testnet", a)],
      dryRun: true,
    };

    const results = await applyPlan(opts, deps);
    // Without the fix, this would have failed with "env var RPC_URL not set".
    assert.equal(results[0].status, "skipped-dry-run");
    assert.equal(calls.length, 0);
  });

  it("still rejects missing env vars on a real (non-dry) run", async () => {
    const a = unit("A");
    const m = manifest("ethereal-testnet", "testnet", [a]);
    const { runner, calls } = makeForgeStub({});
    const deps = makeDeps(runner, { resolveEnv: () => ({}) });
    const opts: ApplyOptions = {
      manifests: { "ethereal-testnet": m } as Record<EnvName, Manifest>,
      configs: { testnet: {} },
      items: [deployItem("ethereal-testnet", a)],
      // dryRun: false (default)
    };

    const results = await applyPlan(opts, deps);
    assert.equal(results[0].status, "failure");
    assert.match(results[0].error ?? "", /env var RPC_URL not set/);
    assert.equal(calls.length, 0);
  });
});

describe("applyPlan — simulate", () => {
  it("invokes forge without --broadcast and parses addresses, but persists nothing", async () => {
    const factory = unit("Factory");
    const m = manifest("ethereal-testnet", "testnet", [factory]);
    const { runner, calls } = makeForgeStub({
      [factory.script]: { stdout: STDOUT_FACTORY },
    });
    const deps = makeDeps(runner);
    const opts: ApplyOptions = {
      manifests: { "ethereal-testnet": m } as Record<EnvName, Manifest>,
      configs: { testnet: {} },
      items: [deployItem("ethereal-testnet", factory)],
      simulate: true,
    };

    const results = await applyPlan(opts, deps);
    assert.equal(results.length, 1);
    assert.equal(results[0].status, "simulated");
    // forge IS invoked …
    assert.equal(calls.length, 1);
    // … but WITHOUT --broadcast.
    assert.equal(calls[0].broadcast, false);
    // Addresses parsed so the operator can see what would deploy.
    assert.ok(results[0].addresses);
    // No state mutation, no config write, no persist.
    assert.equal(m.units.Factory.state, undefined);
    assert.equal(deps.persistedManifests.length, 0);
    assert.equal(deps.persistedConfigs.length, 0);
  });

  it("does not pass --verify args even when noVerify is false", async () => {
    const factory = unit("Factory");
    const m = manifest("ethereal-testnet", "testnet", [factory]);
    // Attach a verifier to the chain so a non-simulate run would emit
    // --verify; simulate must override that.
    m.chain.verifier = { kind: "blockscout", explorerUrlEnv: "EXPL_URL" };
    const { runner, calls } = makeForgeStub({
      [factory.script]: { stdout: STDOUT_FACTORY },
    });
    const deps = makeDeps(runner, {
      resolveEnv: () => ({
        RPC_URL: "http://x",
        DEPLOYER_PK: "0x1",
        EXPL_URL: "https://e.example/api/",
      }),
    });
    const opts: ApplyOptions = {
      manifests: { "ethereal-testnet": m } as Record<EnvName, Manifest>,
      configs: { testnet: {} },
      items: [deployItem("ethereal-testnet", factory)],
      simulate: true,
    };
    await applyPlan(opts, deps);
    assert.equal(
      calls[0].extraArgs.includes("--verify"),
      false,
      "simulate must strip --verify",
    );
  });
});

describe("applyPlan — cross-bundle resolution", () => {
  it("routes config writes to the manifest's own bundle", async () => {
    const factory = unit("Factory");
    const mEth = manifest("ethereal-testnet", "testnet", [factory]);
    const mPoly = manifest("polygon", "mainnet", [unit("CTReader")]);

    const { runner } = makeForgeStub({
      [factory.script]: { stdout: STDOUT_FACTORY },
      [unit("CTReader").script]: { stdout: "  CTREADER_ADDRESS= 0xcccccccccccccccccccccccccccccccccccccccc" },
    });
    const deps = makeDeps(runner);
    const opts: ApplyOptions = {
      manifests: { "ethereal-testnet": mEth, polygon: mPoly } as Record<EnvName, Manifest>,
      configs: { testnet: {}, mainnet: {} },
      items: [
        deployItem("ethereal-testnet", factory),
        deployItem("polygon", unit("CTReader")),
      ],
    };

    await applyPlan(opts, deps);

    assert.ok(
      opts.configs.testnet?.FACTORY_ADDRESS,
      "ethereal-testnet should write to testnet config",
    );
    assert.equal(
      opts.configs.testnet?.CTREADER_ADDRESS,
      undefined,
      "polygon's address must NOT land in testnet config",
    );
    assert.ok(
      opts.configs.mainnet?.CTREADER_ADDRESS,
      "polygon should write to mainnet config",
    );
  });
});

// ---------- buildVerifyArgs ----------

describe("buildVerifyArgs", () => {
  it("returns [] when no verifier is declared", () => {
    assert.deepEqual(buildVerifyArgs(undefined, {}), []);
  });

  it("builds Blockscout args from explorerUrlEnv", () => {
    const v: VerifierConfig = {
      kind: "blockscout",
      explorerUrlEnv: "PM_NETWORK_EXPLORER_URL",
    };
    const args = buildVerifyArgs(v, {
      PM_NETWORK_EXPLORER_URL: "https://explorer.ethereal.trade/api/",
    });
    assert.deepEqual(args, [
      "--verify",
      "--verifier",
      "blockscout",
      "--verifier-url",
      "https://explorer.ethereal.trade/api/",
    ]);
  });

  it("builds Etherscan args from apiKeyEnv", () => {
    const v: VerifierConfig = {
      kind: "etherscan",
      apiKeyEnv: "SM_NETWORK_ETHERSCAN_API_KEY",
    };
    const args = buildVerifyArgs(v, {
      SM_NETWORK_ETHERSCAN_API_KEY: "ABC123",
    });
    assert.deepEqual(args, ["--verify", "--etherscan-api-key", "ABC123"]);
  });

  it("silently returns [] when the required env var is missing", () => {
    const v: VerifierConfig = {
      kind: "blockscout",
      explorerUrlEnv: "PM_NETWORK_EXPLORER_URL",
    };
    assert.deepEqual(buildVerifyArgs(v, {}), []);
  });
});

// ---------- factorySaltFor ----------

describe("factorySaltFor", () => {
  it("delegates to the injected keccak with a deterministic seed", async () => {
    const seen: string[] = [];
    const keccak = async (s: string) => {
      seen.push(s);
      return "0xabc";
    };
    const salt = await factorySaltFor(
      "testnet",
      new Date("2026-05-13T12:34:56Z"),
      keccak,
    );
    assert.equal(salt, "0xabc");
    assert.deepEqual(seen, [
      "sapience-prediction-market-token-factory-testnet-2026-05-13",
    ]);
  });

  it("uses UTC date components even when local TZ differs", async () => {
    const seen: string[] = [];
    const keccak = async (s: string) => {
      seen.push(s);
      return "0xdef";
    };
    // 23:30 UTC on the 13th -> still 13th regardless of local TZ.
    await factorySaltFor(
      "mainnet",
      new Date("2026-05-13T23:30:00Z"),
      keccak,
    );
    assert.equal(
      seen[0],
      "sapience-prediction-market-token-factory-mainnet-2026-05-13",
    );
  });
});

// ---------- validateDeployer ----------

describe("validateDeployer", () => {
  const m = manifest("ethereal-testnet", "testnet", [unit("Foo")]);
  m.chain.deployerAddressEnv = "DEPLOYER_ADDR";

  it("returns ok=true when derived address matches declared", async () => {
    const r = await validateDeployer(
      m,
      { DEPLOYER_PK: "0xdead", DEPLOYER_ADDR: "0xAbCd" },
      async () => "0xabcd", // lowercase
    );
    assert.deepEqual(r, { ok: true });
  });

  it("returns ok=false with reason on mismatch", async () => {
    const r = await validateDeployer(
      m,
      { DEPLOYER_PK: "0xdead", DEPLOYER_ADDR: "0x1111" },
      async () => "0x2222",
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /controls 0x2222.*DEPLOYER_ADDR is set to 0x1111/);
  });

  it("returns ok=true when env vars are missing (nothing to check)", async () => {
    const r = await validateDeployer(
      m,
      {},
      async () => {
        throw new Error("should not be called");
      },
    );
    assert.deepEqual(r, { ok: true });
  });
});

// ---------- legacy rotation ----------

describe("applyPlan — legacy rotation", () => {
  it("captures blockCreated on a fresh deploy", async () => {
    const u = unit("Factory");
    const m = manifest("ethereal-testnet", "testnet", [u]);
    const stdout = "  FACTORY_ADDRESS= 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const { runner } = makeForgeStub({ [u.script]: { stdout } });
    const deps = makeDeps(runner, { getBlockNumber: async () => 12345 });
    const opts: ApplyOptions = {
      manifests: { "ethereal-testnet": m } as Record<EnvName, Manifest>,
      configs: { testnet: {} },
      items: [deployItem("ethereal-testnet", u)],
    };
    await applyPlan(opts, deps);
    assert.equal(m.units.Factory.state?.blockCreated, 12345);
    assert.equal(m.units.Factory.state?.legacy, undefined);
  });

  it("rotates the previous {address,blockCreated,…} into legacy[0]", async () => {
    const u = unit("Factory");
    const m = manifest("ethereal-testnet", "testnet", [
      {
        ...u,
        state: {
          address: "0xprevprevprevprevprevprevprevprevprevprev",
          blockCreated: 100,
          deployedAt: "2026-01-01T00:00:00.000Z",
          gitSha: "older",
          txHash: "0xtx-old",
        },
      },
    ]);
    const stdout = "  FACTORY_ADDRESS= 0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const { runner } = makeForgeStub({ [u.script]: { stdout } });
    const deps = makeDeps(runner, { getBlockNumber: async () => 200 });
    const opts: ApplyOptions = {
      manifests: { "ethereal-testnet": m } as Record<EnvName, Manifest>,
      configs: { testnet: {} },
      items: [deployItem("ethereal-testnet", u)],
    };
    await applyPlan(opts, deps);
    const state = m.units.Factory.state!;
    assert.equal(state.address, "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    assert.equal(state.blockCreated, 200);
    assert.equal(state.legacy?.length, 1);
    assert.equal(state.legacy?.[0].address, "0xprevprevprevprevprevprevprevprevprevprev");
    assert.equal(state.legacy?.[0].blockCreated, 100);
    assert.equal(state.legacy?.[0].gitSha, "older");
    assert.equal(state.legacy?.[0].txHash, "0xtx-old");
    assert.equal(state.legacy?.[0].replacedAt, "2026-05-13T12:00:00.000Z");
  });

  it("does not push to legacy when the address didn't change", async () => {
    const sameAddr = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const u = unit("Factory");
    const m = manifest("ethereal-testnet", "testnet", [
      { ...u, state: { address: sameAddr, blockCreated: 100 } },
    ]);
    const stdout = `  FACTORY_ADDRESS= ${sameAddr}`;
    const { runner } = makeForgeStub({ [u.script]: { stdout } });
    const deps = makeDeps(runner, { getBlockNumber: async () => 200 });
    const opts: ApplyOptions = {
      manifests: { "ethereal-testnet": m } as Record<EnvName, Manifest>,
      configs: { testnet: {} },
      items: [deployItem("ethereal-testnet", u)],
    };
    await applyPlan(opts, deps);
    assert.equal(m.units.Factory.state?.legacy, undefined);
    // blockCreated does update.
    assert.equal(m.units.Factory.state?.blockCreated, 200);
  });

  it("preserves pre-existing legacy entries when rotating", async () => {
    const u = unit("Factory");
    const m = manifest("ethereal-testnet", "testnet", [
      {
        ...u,
        state: {
          address: "0xprevprevprevprevprevprevprevprevprevprev",
          blockCreated: 100,
          legacy: [
            { address: "0xeveneveneveneveneveneveneveneveneveneven", blockCreated: 50 },
          ],
        },
      },
    ]);
    const stdout = "  FACTORY_ADDRESS= 0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const { runner } = makeForgeStub({ [u.script]: { stdout } });
    const deps = makeDeps(runner, { getBlockNumber: async () => 200 });
    const opts: ApplyOptions = {
      manifests: { "ethereal-testnet": m } as Record<EnvName, Manifest>,
      configs: { testnet: {} },
      items: [deployItem("ethereal-testnet", u)],
    };
    await applyPlan(opts, deps);
    const legacy = m.units.Factory.state!.legacy!;
    assert.equal(legacy.length, 2);
    assert.equal(legacy[0].address, "0xprevprevprevprevprevprevprevprevprevprev");
    assert.equal(legacy[1].address, "0xeveneveneveneveneveneveneveneveneveneven");
  });
});

// ---------- verify args wiring ----------

describe("applyPlan — verify forwarding", () => {
  it("passes --verify --verifier blockscout to forge when chain.verifier is blockscout", async () => {
    const u = unit("Factory");
    const m = manifest("ethereal-testnet", "testnet", [u]);
    m.chain.verifier = {
      kind: "blockscout",
      explorerUrlEnv: "PM_NETWORK_EXPLORER_URL",
    };
    let capturedExtra: string[] | undefined;
    const runner: ForgeRunner = async (inv) => {
      capturedExtra = inv.extraArgs;
      return { stdout: "  FACTORY_ADDRESS= 0xfffffffffffffffffffffffffffffffffffffffff".slice(0, 56), stderr: "", exitCode: 0 };
    };
    const deps = makeDeps(runner, {
      resolveEnv: () => ({
        RPC_URL: "https://stub.rpc",
        DEPLOYER_PK: "0xdeadbeef",
        PM_NETWORK_EXPLORER_URL: "https://explorer.ethereal.trade/api/",
      }),
    });
    const opts: ApplyOptions = {
      manifests: { "ethereal-testnet": m } as Record<EnvName, Manifest>,
      configs: { testnet: {} },
      items: [deployItem("ethereal-testnet", u)],
    };
    await applyPlan(opts, deps);
    assert.deepEqual(capturedExtra, [
      "--verify",
      "--verifier",
      "blockscout",
      "--verifier-url",
      "https://explorer.ethereal.trade/api/",
    ]);
  });

  it("does not pass --verify when --no-verify is set", async () => {
    const u = unit("Factory");
    const m = manifest("ethereal-testnet", "testnet", [u]);
    m.chain.verifier = {
      kind: "blockscout",
      explorerUrlEnv: "PM_NETWORK_EXPLORER_URL",
    };
    let capturedExtra: string[] | undefined;
    const runner: ForgeRunner = async (inv) => {
      capturedExtra = inv.extraArgs;
      return { stdout: "  FACTORY_ADDRESS= 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", stderr: "", exitCode: 0 };
    };
    const deps = makeDeps(runner, {
      resolveEnv: () => ({
        RPC_URL: "https://stub.rpc",
        DEPLOYER_PK: "0xdeadbeef",
        PM_NETWORK_EXPLORER_URL: "https://explorer.ethereal.trade/api/",
      }),
    });
    const opts: ApplyOptions = {
      manifests: { "ethereal-testnet": m } as Record<EnvName, Manifest>,
      configs: { testnet: {} },
      items: [deployItem("ethereal-testnet", u)],
      noVerify: true,
    };
    await applyPlan(opts, deps);
    assert.deepEqual(capturedExtra, []);
  });

  it("does not pass --verify on configure items even with verifier set", async () => {
    const u = unit("Factory");
    const m = manifest("ethereal-testnet", "testnet", [u]);
    m.chain.verifier = {
      kind: "blockscout",
      explorerUrlEnv: "PM_NETWORK_EXPLORER_URL",
    };
    let capturedExtra: string[] | undefined;
    const runner: ForgeRunner = async (inv) => {
      capturedExtra = inv.extraArgs;
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    const deps = makeDeps(runner, {
      resolveEnv: () => ({
        RPC_URL: "https://stub.rpc",
        DEPLOYER_PK: "0xdeadbeef",
        PM_NETWORK_EXPLORER_URL: "https://explorer.ethereal.trade/api/",
      }),
    });
    const opts: ApplyOptions = {
      manifests: { "ethereal-testnet": m } as Record<EnvName, Manifest>,
      configs: { testnet: {} },
      items: [configureItem("ethereal-testnet", u, "Configure.s.sol:C")],
    };
    await applyPlan(opts, deps);
    assert.deepEqual(capturedExtra, []);
  });
});
