import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildVerifyFlags,
  verifyAll,
  type VerifyDeps,
  type VerifyInvocation,
  type VerifyResult,
  type VerifyRunner,
} from "../verify.ts";
import type { DeployUnit, EnvName, Manifest, VerifierConfig } from "../schema.ts";

// ---------- fixture helpers ----------

function unit(name: string, overrides: Partial<DeployUnit> = {}): DeployUnit {
  return {
    name,
    contract: name,
    contractPath: `src/${name}.sol:${name}`,
    script: `Deploy${name}.s.sol:Deploy${name}`,
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
  chainId: number,
  verifier: VerifierConfig | undefined,
  units: DeployUnit[],
): Manifest {
  return {
    env,
    bundle,
    chain: { name: env, chainId, verifier },
    units: Object.fromEntries(units.map((u) => [u.name, u])),
  };
}

interface RecordedCall {
  inv: VerifyInvocation;
}

function makeRunner(
  outputs: Record<string, Partial<VerifyResult>> = {},
): { runner: VerifyRunner; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const runner: VerifyRunner = async (inv) => {
    calls.push({ inv });
    const o = outputs[`${inv.address}/${inv.contractPath}`] ?? {};
    return {
      stdout: o.stdout ?? "",
      stderr: o.stderr ?? "",
      exitCode: o.exitCode ?? 0,
    };
  };
  return { runner, calls };
}

function makeDeps(
  runner: VerifyRunner,
  envVars: Record<string, string> = {},
): VerifyDeps {
  return {
    resolveEnv: () => envVars,
    runVerify: runner,
  };
}

// ---------- buildVerifyFlags ----------

describe("buildVerifyFlags", () => {
  it("emits Blockscout flags when explorerUrlEnv is set", () => {
    const r = buildVerifyFlags(
      { kind: "blockscout", explorerUrlEnv: "EXPL_URL" },
      { EXPL_URL: "https://blockscout.example/api/" },
    );
    assert.ok("flags" in r);
    assert.deepEqual(r.flags, [
      "--verifier",
      "blockscout",
      "--verifier-url",
      "https://blockscout.example/api/",
    ]);
  });

  it("emits Etherscan flags when apiKeyEnv is set", () => {
    const r = buildVerifyFlags(
      { kind: "etherscan", apiKeyEnv: "API_KEY" },
      { API_KEY: "ABC123" },
    );
    assert.ok("flags" in r);
    assert.deepEqual(r.flags, ["--etherscan-api-key", "ABC123"]);
  });

  it("skips with a reason when explorerUrlEnv is missing", () => {
    const r = buildVerifyFlags(
      { kind: "blockscout", explorerUrlEnv: "EXPL_URL" },
      {},
    );
    assert.ok("skip" in r);
    assert.match(r.skip, /EXPL_URL not set/);
  });

  it("skips when apiKeyEnv is missing", () => {
    const r = buildVerifyFlags(
      { kind: "etherscan", apiKeyEnv: "API_KEY" },
      {},
    );
    assert.ok("skip" in r);
    assert.match(r.skip, /API_KEY not set/);
  });

  it("skips when no verifier is configured on the chain", () => {
    const r = buildVerifyFlags(undefined, {});
    assert.ok("skip" in r);
    assert.match(r.skip, /no verifier/);
  });
});

// ---------- verifyAll ----------

describe("verifyAll", () => {
  const blockscout: VerifierConfig = {
    kind: "blockscout",
    explorerUrlEnv: "EXPL_URL",
  };

  it("verifies every unit with a recorded address in the bundle", async () => {
    const fooAddr = "0xfafafafafafafafafafafafafafafafafafafafa";
    const barAddr = "0xbabababababababababababababababababababa";
    const eth = manifest(
      "ethereal-testnet",
      "testnet",
      13374202,
      blockscout,
      [
        { ...unit("Foo"), state: { address: fooAddr } },
        { ...unit("Bar"), state: { address: barAddr } },
      ],
    );

    const { runner, calls } = makeRunner();
    const results = await verifyAll(
      {
        manifests: { "ethereal-testnet": eth } as Record<EnvName, Manifest>,
        bundle: "testnet",
      },
      makeDeps(runner, { EXPL_URL: "https://e.example/api/" }),
    );

    assert.equal(results.length, 2);
    assert.equal(results.every((r) => r.status === "verified"), true);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].inv.chainId, 13374202);
    assert.equal(
      calls[0].inv.verifyFlags.join(" "),
      "--verifier blockscout --verifier-url https://e.example/api/",
    );
  });

  it("excludes manifests in other bundles", async () => {
    const fooAddr = "0xfafafafafafafafafafafafafafafafafafafafa";
    const barAddr = "0xbabababababababababababababababababababa";
    const eth = manifest("ethereal-testnet", "testnet", 13374202, blockscout, [
      { ...unit("Foo"), state: { address: fooAddr } },
    ]);
    const main = manifest("ethereal-mainnet", "mainnet", 5064014, blockscout, [
      { ...unit("Bar"), state: { address: barAddr } },
    ]);

    const { runner } = makeRunner();
    const results = await verifyAll(
      {
        manifests: {
          "ethereal-testnet": eth,
          "ethereal-mainnet": main,
        } as Record<EnvName, Manifest>,
        bundle: "testnet",
      },
      makeDeps(runner, { EXPL_URL: "https://e.example/api/" }),
    );

    assert.equal(results.length, 1);
    assert.equal(results[0].env, "ethereal-testnet");
  });

  it("optional --env narrows further to a single env", async () => {
    const fooAddr = "0xfafafafafafafafafafafafafafafafafafafafa";
    const eth = manifest("ethereal-testnet", "testnet", 13374202, blockscout, [
      { ...unit("Foo"), state: { address: fooAddr } },
    ]);
    const arb = manifest(
      "arbitrum-sepolia",
      "testnet",
      421614,
      { kind: "etherscan", apiKeyEnv: "API_KEY" },
      [
        {
          ...unit("Bar", { contractPath: "src/Bar.sol:Bar" }),
          state: { address: "0xbabababababababababababababababababababa" },
        },
      ],
    );

    const { runner } = makeRunner();
    const results = await verifyAll(
      {
        manifests: {
          "ethereal-testnet": eth,
          "arbitrum-sepolia": arb,
        } as Record<EnvName, Manifest>,
        bundle: "testnet",
        env: "arbitrum-sepolia",
      },
      makeDeps(runner, {
        EXPL_URL: "https://e.example/api/",
        API_KEY: "ABC",
      }),
    );

    assert.equal(results.length, 1);
    assert.equal(results[0].env, "arbitrum-sepolia");
  });

  it("skips units without a recorded address", async () => {
    const eth = manifest("ethereal-testnet", "testnet", 13374202, blockscout, [
      unit("NeverDeployed"), // no state.address
    ]);
    const { runner, calls } = makeRunner();
    const results = await verifyAll(
      {
        manifests: { "ethereal-testnet": eth } as Record<EnvName, Manifest>,
        bundle: "testnet",
      },
      makeDeps(runner, { EXPL_URL: "https://e.example/api/" }),
    );
    assert.equal(results.length, 1);
    assert.equal(results[0].status, "skipped");
    assert.match(results[0].reason ?? "", /no recorded address/);
    assert.equal(calls.length, 0);
  });

  it("skips units without contractPath", async () => {
    const fooAddr = "0xfafafafafafafafafafafafafafafafafafafafa";
    const eth = manifest("ethereal-testnet", "testnet", 13374202, blockscout, [
      {
        ...unit("Foo", { contractPath: undefined }),
        state: { address: fooAddr },
      },
    ]);
    const { runner, calls } = makeRunner();
    const results = await verifyAll(
      {
        manifests: { "ethereal-testnet": eth } as Record<EnvName, Manifest>,
        bundle: "testnet",
      },
      makeDeps(runner, { EXPL_URL: "https://e.example/api/" }),
    );
    assert.equal(results[0].status, "skipped");
    assert.match(results[0].reason ?? "", /contractPath/);
    assert.equal(calls.length, 0);
  });

  it("halts on first failure by default", async () => {
    const a = "0xfafafafafafafafafafafafafafafafafafafafa";
    const b = "0xbabababababababababababababababababababa";
    const eth = manifest("ethereal-testnet", "testnet", 13374202, blockscout, [
      {
        ...unit("Foo", { contractPath: "src/Foo.sol:Foo" }),
        state: { address: a },
      },
      {
        ...unit("Bar", { contractPath: "src/Bar.sol:Bar" }),
        state: { address: b },
      },
    ]);
    const { runner, calls } = makeRunner({
      [`${a}/src/Foo.sol:Foo`]: { exitCode: 1, stderr: "rejected" },
    });
    const results = await verifyAll(
      {
        manifests: { "ethereal-testnet": eth } as Record<EnvName, Manifest>,
        bundle: "testnet",
      },
      makeDeps(runner, { EXPL_URL: "https://e.example/api/" }),
    );
    assert.equal(results.length, 1);
    assert.equal(results[0].status, "failure");
    assert.equal(calls.length, 1);
  });

  it("multi-output: verifies each declared output as its own contract", async () => {
    const execAddr = "0x1111111111111111111111111111111111111111";
    const poolAddr = "0x2222222222222222222222222222222222222222";
    const eth = manifest(
      "ethereal-testnet",
      "testnet",
      13374202,
      blockscout,
      [
        {
          name: "Stack",
          contract: "Executor",
          contractPath: "src/Executor.sol:Executor",
          script: "DeployStack.s.sol:DeployStack",
          produces: ["EXEC_ADDRESS", "POOL_ADDRESS"],
          outputs: {
            EXEC_ADDRESS: {
              contract: "Executor",
              contractPath: "src/Executor.sol:Executor",
            },
            POOL_ADDRESS: {
              contract: "Pool",
              contractPath: "src/Pool.sol:Pool",
            },
          },
          constructorDeps: [],
          wiringPeers: [],
          configureScripts: [],
          state: {
            address: execAddr,
            addresses: { EXEC_ADDRESS: execAddr, POOL_ADDRESS: poolAddr },
          },
        },
      ],
    );

    const { runner, calls } = makeRunner();
    const results = await verifyAll(
      {
        manifests: { "ethereal-testnet": eth } as Record<EnvName, Manifest>,
        bundle: "testnet",
      },
      makeDeps(runner, { EXPL_URL: "https://e.example/api/" }),
    );
    assert.equal(results.length, 2);
    assert.deepEqual(
      calls.map((c) => `${c.inv.address}/${c.inv.contractPath}`),
      [`${execAddr}/src/Executor.sol:Executor`, `${poolAddr}/src/Pool.sol:Pool`],
    );
    assert.equal(results.every((r) => r.status === "verified"), true);
  });

  it("--continue-on-error attempts every unit", async () => {
    const a = "0xfafafafafafafafafafafafafafafafafafafafa";
    const b = "0xbabababababababababababababababababababa";
    const eth = manifest("ethereal-testnet", "testnet", 13374202, blockscout, [
      {
        ...unit("Foo", { contractPath: "src/Foo.sol:Foo" }),
        state: { address: a },
      },
      {
        ...unit("Bar", { contractPath: "src/Bar.sol:Bar" }),
        state: { address: b },
      },
    ]);
    const { runner, calls } = makeRunner({
      [`${a}/src/Foo.sol:Foo`]: { exitCode: 1, stderr: "rejected" },
    });
    const results = await verifyAll(
      {
        manifests: { "ethereal-testnet": eth } as Record<EnvName, Manifest>,
        bundle: "testnet",
        continueOnError: true,
      },
      makeDeps(runner, { EXPL_URL: "https://e.example/api/" }),
    );
    assert.equal(results.length, 2);
    assert.equal(results[0].status, "failure");
    assert.equal(results[1].status, "verified");
    assert.equal(calls.length, 2);
  });
});
