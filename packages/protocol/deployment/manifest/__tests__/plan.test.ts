import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computePlan, type HashMap } from "../plan.ts";
import type { DeployUnit, EnvName, Manifest } from "../schema.ts";

// ---------- fixture helpers ----------

function unit(
  name: string,
  overrides: Partial<DeployUnit> = {},
): DeployUnit {
  return {
    name,
    contract: name,
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
  units: DeployUnit[],
): Manifest {
  return {
    env,
    bundle,
    chain: { name: env, chainId: 1 },
    units: Object.fromEntries(units.map((u) => [u.name, u])),
  };
}

function hashes(entries: Array<[string, string | undefined]>): HashMap {
  return new Map(entries);
}

// ---------- empty plans ----------

describe("computePlan — empty cases", () => {
  it("returns no items when artifact hashes match recorded state", () => {
    const m = manifest("ethereal-testnet", "testnet", [
      {
        ...unit("Foo"),
        state: { address: "0xa", bytecodeHash: "0xh1" },
      },
    ]);
    const plan = computePlan({
      manifests: { "ethereal-testnet": m },
      currentHashes: hashes([["ethereal-testnet:Foo", "0xh1"]]),
    });
    assert.equal(plan.items.length, 0);
    assert.equal(plan.dirty.size, 0);
  });

  it("ignores units without artifact AND without prior state (no signal)", () => {
    const m = manifest("ethereal-testnet", "testnet", [unit("Foo")]);
    const plan = computePlan({
      manifests: { "ethereal-testnet": m },
      currentHashes: hashes([["ethereal-testnet:Foo", undefined]]),
    });
    assert.equal(plan.items.length, 0);
  });
});

// ---------- bytecode signal ----------

describe("computePlan — bytecode signal", () => {
  it("marks a unit dirty when its bytecode hash diverged", () => {
    const m = manifest("ethereal-testnet", "testnet", [
      {
        ...unit("Foo"),
        state: { address: "0xa", bytecodeHash: "0xold" },
      },
    ]);
    const plan = computePlan({
      manifests: { "ethereal-testnet": m },
      currentHashes: hashes([["ethereal-testnet:Foo", "0xnew"]]),
    });
    assert.equal(plan.items.length, 1);
    const item = plan.items[0];
    assert.equal(item.kind, "deploy");
    assert.equal(item.env, "ethereal-testnet");
    assert.equal(item.unit, "Foo");
    assert.ok(item.reasons.some((r) => r.includes("bytecode changed")));
  });

  it("marks a unit dirty when it has never been deployed (no address)", () => {
    const m = manifest("ethereal-testnet", "testnet", [unit("Foo")]);
    const plan = computePlan({
      manifests: { "ethereal-testnet": m },
      currentHashes: hashes([["ethereal-testnet:Foo", "0xh1"]]),
    });
    assert.equal(plan.items.length, 1);
    assert.deepEqual(plan.items[0].reasons, ["never deployed"]);
  });

  it("marks dirty when on-chain bytecode hash differs from the current artifact", () => {
    const m = manifest("ethereal-testnet", "testnet", [
      {
        ...unit("Foo"),
        state: {
          address: "0xa",
          // Manifest snapshot agrees with current artifact …
          bytecodeHash: "0xnew",
          // … but the live chain still has the OLD code at this address.
          onchainBytecodeHash: "0xold",
        },
      },
    ]);
    const plan = computePlan({
      manifests: { "ethereal-testnet": m },
      currentHashes: hashes([["ethereal-testnet:Foo", "0xnew"]]),
    });
    assert.equal(plan.items.length, 1);
    assert.ok(
      plan.items[0].reasons.some((r) => r.includes("on-chain bytecode out of date")),
      `expected "on-chain bytecode out of date" reason, got: ${plan.items[0].reasons.join(",")}`,
    );
  });

  it("on-chain hash match keeps a unit clean even when manifest bytecodeHash drifts", () => {
    // Mostly defensive: protect against a state where state.bytecodeHash is
    // stale but the on-chain code is in sync. The on-chain signal is
    // authoritative, so the unit should NOT redeploy.
    const m = manifest("ethereal-testnet", "testnet", [
      {
        ...unit("Foo"),
        state: {
          address: "0xa",
          bytecodeHash: "0xstale",
          onchainBytecodeHash: "0xcurrent",
        },
      },
    ]);
    const plan = computePlan({
      manifests: { "ethereal-testnet": m },
      currentHashes: hashes([["ethereal-testnet:Foo", "0xcurrent"]]),
    });
    assert.equal(plan.items.length, 0);
  });

  it("does not mark dirty when hash unknown (no prior + no artifact)", () => {
    const m = manifest("ethereal-testnet", "testnet", [
      { ...unit("Foo"), state: { address: "0xa" } }, // address known but no hash recorded
    ]);
    const plan = computePlan({
      manifests: { "ethereal-testnet": m },
      currentHashes: hashes([["ethereal-testnet:Foo", undefined]]),
    });
    assert.equal(plan.items.length, 0);
  });
});

// ---------- constructorDeps cascade ----------

describe("computePlan — constructorDeps cascade", () => {
  it("redeploys dependents transitively", () => {
    const m = manifest("ethereal-testnet", "testnet", [
      { ...unit("Factory"), state: { address: "0xf", bytecodeHash: "0xold" } },
      {
        ...unit("Escrow", { constructorDeps: ["Factory"] }),
        state: { address: "0xe", bytecodeHash: "0xeh" },
      },
      {
        ...unit("Sponsor", { constructorDeps: ["Escrow"] }),
        state: { address: "0xs", bytecodeHash: "0xsh" },
      },
    ]);
    const plan = computePlan({
      manifests: { "ethereal-testnet": m },
      currentHashes: hashes([
        ["ethereal-testnet:Factory", "0xnew"],
        ["ethereal-testnet:Escrow", "0xeh"], // unchanged
        ["ethereal-testnet:Sponsor", "0xsh"], // unchanged
      ]),
    });

    const deploys = plan.items.filter((i) => i.kind === "deploy");
    assert.equal(deploys.length, 3);
    assert.deepEqual(
      deploys.map((d) => d.unit),
      ["Factory", "Escrow", "Sponsor"],
    );
    // Cascaded reason is recorded:
    assert.ok(
      deploys[1].reasons.some((r) => r.includes("depends on")),
      "Escrow should be flagged as depending on Factory",
    );
  });

  it("emits deploys in topological order (deps before dependents)", () => {
    // Force all three dirty; without topo order they might come in any order.
    const m = manifest("ethereal-testnet", "testnet", [
      unit("A"),
      unit("B", { constructorDeps: ["A"] }),
      unit("C", { constructorDeps: ["B"] }),
    ]);
    const plan = computePlan({
      manifests: { "ethereal-testnet": m },
      currentHashes: hashes([
        ["ethereal-testnet:A", "0xa"],
        ["ethereal-testnet:B", "0xb"],
        ["ethereal-testnet:C", "0xc"],
      ]),
    });
    const order = plan.items
      .filter((i) => i.kind === "deploy")
      .map((d) => d.unit);
    assert.deepEqual(order, ["A", "B", "C"]);
  });

  it("detects cycles in constructorDeps", () => {
    const m = manifest("ethereal-testnet", "testnet", [
      unit("A", { constructorDeps: ["B"] }),
      unit("B", { constructorDeps: ["A"] }),
    ]);
    // Bypass assertManifest (which doesn't validate cycles) — feed directly.
    assert.throws(
      () =>
        computePlan({
          manifests: { "ethereal-testnet": m },
          currentHashes: hashes([
            ["ethereal-testnet:A", "0xa"],
            ["ethereal-testnet:B", "0xb"],
          ]),
        }),
      /Cycle detected/,
    );
  });
});

// ---------- stateInvalidatedBy cascade ----------

describe("computePlan — stateInvalidatedBy cascade", () => {
  it("marks a unit dirty when one of its stateInvalidatedBy refs redeploys", () => {
    // Factory accumulates state under PME's authority. If PME redeploys
    // we want Factory to redeploy too even though Factory's source is
    // unchanged and PME isn't in Factory's constructorDeps.
    const m = manifest("ethereal-testnet", "testnet", [
      {
        ...unit("Factory", {
          stateInvalidatedBy: ["PredictionMarketEscrow"],
        }),
        state: { address: "0xf", bytecodeHash: "0xfh" },
      },
      {
        ...unit("PredictionMarketEscrow", { constructorDeps: ["Factory"] }),
        state: { address: "0xe", bytecodeHash: "0xold" },
      },
    ]);
    const plan = computePlan({
      manifests: { "ethereal-testnet": m },
      currentHashes: hashes([
        ["ethereal-testnet:Factory", "0xfh"], // unchanged
        ["ethereal-testnet:PredictionMarketEscrow", "0xnew"], // changed → PME dirty
      ]),
    });

    const deploys = plan.items.filter((i) => i.kind === "deploy");
    const names = deploys.map((d) => d.unit).sort();
    assert.deepEqual(names, ["Factory", "PredictionMarketEscrow"]);

    const factory = deploys.find((d) => d.unit === "Factory")!;
    assert.ok(
      factory.reasons.some((r) => r.includes("state invalidated by")),
      `Factory should be flagged via stateInvalidatedBy, got: ${factory.reasons.join(",")}`,
    );
  });

  it("topologically deploys Factory before PME even with reverse-direction signal", () => {
    // PME triggers the cascade, but Factory must still deploy FIRST
    // because PME.constructorDeps = ["Factory"].
    const m = manifest("ethereal-testnet", "testnet", [
      {
        ...unit("Factory", {
          stateInvalidatedBy: ["PredictionMarketEscrow"],
        }),
        state: { address: "0xf", bytecodeHash: "0xfh" },
      },
      {
        ...unit("PredictionMarketEscrow", { constructorDeps: ["Factory"] }),
        state: { address: "0xe", bytecodeHash: "0xold" },
      },
    ]);
    const plan = computePlan({
      manifests: { "ethereal-testnet": m },
      currentHashes: hashes([
        ["ethereal-testnet:Factory", "0xfh"],
        ["ethereal-testnet:PredictionMarketEscrow", "0xnew"],
      ]),
    });
    const order = plan.items
      .filter((i) => i.kind === "deploy")
      .map((d) => d.unit);
    assert.deepEqual(order, ["Factory", "PredictionMarketEscrow"]);
  });

  it("does NOT cascade when the invalidator is clean", () => {
    const m = manifest("ethereal-testnet", "testnet", [
      {
        ...unit("Factory", {
          stateInvalidatedBy: ["PredictionMarketEscrow"],
        }),
        state: { address: "0xf", bytecodeHash: "0xfh" },
      },
      {
        ...unit("PredictionMarketEscrow", { constructorDeps: ["Factory"] }),
        state: { address: "0xe", bytecodeHash: "0xeh" },
      },
    ]);
    const plan = computePlan({
      manifests: { "ethereal-testnet": m },
      currentHashes: hashes([
        ["ethereal-testnet:Factory", "0xfh"], // unchanged
        ["ethereal-testnet:PredictionMarketEscrow", "0xeh"], // unchanged
      ]),
    });
    assert.equal(plan.items.length, 0);
  });
});

// ---------- twin propagation ----------

describe("computePlan — twin propagation", () => {
  it("propagates dirty to the symmetric twin", () => {
    const eth = manifest("ethereal-testnet", "testnet", [
      {
        ...unit("Factory", { twinOf: "arbitrum:Factory" }),
        state: { address: "0xf", bytecodeHash: "0xold" },
      },
    ]);
    const arb = manifest("arbitrum", "testnet", [
      {
        ...unit("Factory", { twinOf: "ethereal-testnet:Factory" }),
        state: { address: "0xf", bytecodeHash: "0xold" },
      },
    ]);
    const plan = computePlan({
      manifests: { "ethereal-testnet": eth, arbitrum: arb },
      currentHashes: hashes([
        ["ethereal-testnet:Factory", "0xnew"],
        ["arbitrum:Factory", "0xnew"], // same artifact => same hash, but address still must redeploy
      ]),
    });
    assert.equal(plan.dirty.size, 2);
    assert.ok(plan.dirty.has("ethereal-testnet:Factory"));
    assert.ok(plan.dirty.has("arbitrum:Factory"));
  });

  it("forcing one twin pulls the other via the symmetric link", () => {
    // Twin is declared on BOTH sides (post-symmetry-fix). Forcing arbitrum
    // alone still pulls ethereal-testnet in via forward twin propagation from
    // the arbitrum side's twinOf entry.
    const eth = manifest("ethereal-testnet", "testnet", [
      {
        ...unit("Factory", { twinOf: "arbitrum:Factory" }),
        state: { address: "0xf", bytecodeHash: "0xh1" },
      },
    ]);
    const arb = manifest("arbitrum", "testnet", [
      {
        ...unit("Factory", { twinOf: "ethereal-testnet:Factory" }),
        state: { address: "0xf", bytecodeHash: "0xh1" },
      },
    ]);
    const plan = computePlan({
      manifests: { "ethereal-testnet": eth, arbitrum: arb },
      currentHashes: hashes([
        ["ethereal-testnet:Factory", "0xh1"],
        ["arbitrum:Factory", "0xh1"],
      ]),
      forced: new Set(["arbitrum:Factory"]),
    });
    assert.equal(plan.dirty.size, 2);
    assert.ok(plan.dirty.has("ethereal-testnet:Factory"));
    assert.ok(plan.dirty.has("arbitrum:Factory"));
  });
});

// ---------- wiringPeers ----------

describe("computePlan — wiringPeers", () => {
  it("reconfigures peer when its counterpart redeploys (no peer redeploy)", () => {
    const eth = manifest("ethereal-testnet", "testnet", [
      {
        ...unit("Bridge", {
          wiringPeers: ["arbitrum:BridgeRemote"],
          configureScripts: ["ConfigureEth.s.sol:Conf"],
        }),
        state: { address: "0xb", bytecodeHash: "0xold" },
      },
    ]);
    const arb = manifest("arbitrum", "testnet", [
      {
        ...unit("BridgeRemote", {
          wiringPeers: ["ethereal-testnet:Bridge"],
          configureScripts: ["ConfigureArb.s.sol:Conf"],
        }),
        state: { address: "0xbr", bytecodeHash: "0xrh" },
      },
    ]);

    const plan = computePlan({
      manifests: { "ethereal-testnet": eth, arbitrum: arb },
      currentHashes: hashes([
        ["ethereal-testnet:Bridge", "0xnew"],
        ["arbitrum:BridgeRemote", "0xrh"], // unchanged
      ]),
    });

    const deploys = plan.items.filter((i) => i.kind === "deploy");
    const configures = plan.items.filter((i) => i.kind === "configure");
    assert.deepEqual(
      deploys.map((d) => `${d.env}:${d.unit}`),
      ["ethereal-testnet:Bridge"],
    );
    // ethereal Bridge runs its own configure (follow-up); arbitrum BridgeRemote
    // runs its configure because its peer redeployed.
    const arbConf = configures.find((c) => c.env === "arbitrum");
    assert.ok(arbConf, "arbitrum side should reconfigure");
    assert.ok(
      arbConf!.reasons.some((r) => r.includes("wiringPeer ethereal-testnet:Bridge")),
    );
    assert.equal(plan.reconfigure.has("arbitrum:BridgeRemote"), true);
    assert.equal(plan.dirty.has("arbitrum:BridgeRemote"), false);
  });

  it("does NOT add a reconfigure item when the peer is already redeploying", () => {
    // Both sides bytecode change. Both should redeploy and run their own
    // configureScripts as follow-ups — no separate "reconfigure" entry for
    // either side.
    const eth = manifest("ethereal-testnet", "testnet", [
      {
        ...unit("Bridge", {
          wiringPeers: ["arbitrum:BridgeRemote"],
          configureScripts: ["ConfigureEth.s.sol:Conf"],
        }),
        state: { address: "0xb", bytecodeHash: "0xeold" },
      },
    ]);
    const arb = manifest("arbitrum", "testnet", [
      {
        ...unit("BridgeRemote", {
          wiringPeers: ["ethereal-testnet:Bridge"],
          configureScripts: ["ConfigureArb.s.sol:Conf"],
        }),
        state: { address: "0xbr", bytecodeHash: "0xrold" },
      },
    ]);
    const plan = computePlan({
      manifests: { "ethereal-testnet": eth, arbitrum: arb },
      currentHashes: hashes([
        ["ethereal-testnet:Bridge", "0xenew"],
        ["arbitrum:BridgeRemote", "0xrnew"],
      ]),
    });
    assert.equal(plan.reconfigure.size, 0);
    // Each side gets exactly one configure (follow-up to its own deploy).
    const configures = plan.items.filter((i) => i.kind === "configure");
    assert.equal(configures.length, 2);
  });
});

// ---------- forced redeploy ----------

describe("computePlan — --force", () => {
  it("marks the forced unit dirty even when bytecode is unchanged", () => {
    const m = manifest("ethereal-testnet", "testnet", [
      { ...unit("Foo"), state: { address: "0xa", bytecodeHash: "0xh1" } },
    ]);
    const plan = computePlan({
      manifests: { "ethereal-testnet": m },
      currentHashes: hashes([["ethereal-testnet:Foo", "0xh1"]]),
      forced: new Set(["ethereal-testnet:Foo"]),
    });
    assert.equal(plan.items.filter((i) => i.kind === "deploy").length, 1);
    assert.ok(
      plan.items[0].reasons.some((r) => r.includes("forced")),
      "forced reason should be recorded",
    );
  });
});

// ---------- configure items ----------

describe("computePlan — configure emission", () => {
  it("emits a configure item for each configureScript of dirty units", () => {
    const m = manifest("ethereal-testnet", "testnet", [
      {
        ...unit("Factory", {
          configureScripts: ["Cfg1.s.sol:A", "Cfg2.s.sol:B"],
        }),
        state: { address: "0xa", bytecodeHash: "0xold" },
      },
    ]);
    const plan = computePlan({
      manifests: { "ethereal-testnet": m },
      currentHashes: hashes([["ethereal-testnet:Factory", "0xnew"]]),
    });
    const configures = plan.items.filter((i) => i.kind === "configure");
    assert.equal(configures.length, 2);
    assert.deepEqual(
      configures.map((c) => c.script),
      ["Cfg1.s.sol:A", "Cfg2.s.sol:B"],
    );
  });

  it("places all configures after all deploys", () => {
    const m = manifest("ethereal-testnet", "testnet", [
      {
        ...unit("Factory", { configureScripts: ["Cfg.s.sol:F"] }),
        state: { address: "0xa", bytecodeHash: "0xold" },
      },
      {
        ...unit("Escrow", {
          constructorDeps: ["Factory"],
          configureScripts: ["Cfg.s.sol:E"],
        }),
        state: { address: "0xe", bytecodeHash: "0xeh" },
      },
    ]);
    const plan = computePlan({
      manifests: { "ethereal-testnet": m },
      currentHashes: hashes([
        ["ethereal-testnet:Factory", "0xnew"],
        ["ethereal-testnet:Escrow", "0xeh"],
      ]),
    });
    const kinds = plan.items.map((i) => i.kind);
    const firstConfigure = kinds.indexOf("configure");
    const lastDeploy = kinds.lastIndexOf("deploy");
    assert.ok(
      lastDeploy < firstConfigure,
      `expected all deploys before configures; got ${kinds.join(",")}`,
    );
  });
});

// ---------- bundle filter ----------

describe("computePlan — bundle filter", () => {
  it("restricts the plan to manifests in the chosen bundle", () => {
    const testnetEsc = unit("EscrowT");
    const mainnetEsc = unit("EscrowM");
    const mTest = manifest("ethereal-testnet", "testnet", [testnetEsc]);
    const mMain = manifest("ethereal-mainnet", "mainnet", [mainnetEsc]);

    // Force one unit per bundle — without --bundle, both would be in the plan.
    const plan = computePlan({
      manifests: {
        "ethereal-testnet": mTest,
        "ethereal-mainnet": mMain,
      },
      currentHashes: hashes([
        ["ethereal-testnet:EscrowT", "0xa"],
        ["ethereal-mainnet:EscrowM", "0xb"],
      ]),
      forced: new Set(["ethereal-testnet:EscrowT", "ethereal-mainnet:EscrowM"]),
      bundle: "testnet",
    });

    const refs = plan.items
      .filter((i) => i.kind === "deploy")
      .map((d) => `${d.env}:${d.unit}`);
    assert.deepEqual(refs, ["ethereal-testnet:EscrowT"]);
  });

  it("without bundle, includes units from every loaded manifest", () => {
    const testnetEsc = unit("EscrowT");
    const mainnetEsc = unit("EscrowM");
    const mTest = manifest("ethereal-testnet", "testnet", [testnetEsc]);
    const mMain = manifest("ethereal-mainnet", "mainnet", [mainnetEsc]);

    const plan = computePlan({
      manifests: {
        "ethereal-testnet": mTest,
        "ethereal-mainnet": mMain,
      },
      currentHashes: hashes([
        ["ethereal-testnet:EscrowT", "0xa"],
        ["ethereal-mainnet:EscrowM", "0xb"],
      ]),
      forced: new Set(["ethereal-testnet:EscrowT", "ethereal-mainnet:EscrowM"]),
    });

    const refs = plan.items
      .filter((i) => i.kind === "deploy")
      .map((d) => `${d.env}:${d.unit}`);
    assert.equal(refs.length, 2);
    assert.ok(refs.includes("ethereal-testnet:EscrowT"));
    assert.ok(refs.includes("ethereal-mainnet:EscrowM"));
  });
});
