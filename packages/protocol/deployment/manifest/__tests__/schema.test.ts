import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  assertCrossEnvRefs,
  assertManifest,
  isBridgeUnit,
  isUnitActive,
  parseUnitRef,
  type DeployUnit,
  type Manifest,
} from "../schema.ts";

function baseManifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    env: "ethereal-testnet",
    bundle: "testnet",
    chain: { name: "Ethereal Testnet", chainId: 13374202 },
    units: {},
    ...overrides,
  };
}

describe("parseUnitRef", () => {
  it("parses env:unit form", () => {
    const parsed = parseUnitRef("ethereal-testnet:Factory");
    assert.equal(parsed.env, "ethereal-testnet");
    assert.equal(parsed.unit, "Factory");
  });

  it("rejects missing colon", () => {
    assert.throws(() => parseUnitRef("ethereal-testnet"), /missing ':'/);
  });

  it("rejects unknown env", () => {
    assert.throws(() => parseUnitRef("rinkeby:Factory"), /Unknown env/);
  });

  it("rejects empty unit name", () => {
    assert.throws(() => parseUnitRef("ethereal-testnet:"), /Empty unit/);
  });
});

describe("assertManifest", () => {
  it("accepts a minimal valid manifest", () => {
    const m = assertManifest(baseManifest(), "test.json");
    assert.equal(m.env, "ethereal-testnet");
    assert.equal(m.bundle, "testnet");
  });

  it("rejects unknown env", () => {
    const raw = { ...baseManifest(), env: "rinkeby" };
    assert.throws(() => assertManifest(raw, "test.json"), /env must be one of/);
  });

  it("rejects unknown bundle", () => {
    const raw = { ...baseManifest(), bundle: "staging" };
    assert.throws(() => assertManifest(raw, "test.json"), /bundle must be/);
  });

  it("rejects unit whose key does not match its name", () => {
    const raw = baseManifest({
      units: {
        Foo: {
          name: "Bar",
          contract: "Bar",
          script: "X.s.sol:X",
          produces: [],
          constructorDeps: [],
          wiringPeers: [],
          configureScripts: [],
        },
      },
    });
    assert.throws(
      () => assertManifest(raw, "test.json"),
      /does not match unit.name/,
    );
  });

  it("rejects unit referencing missing intra-env constructorDep", () => {
    const raw = baseManifest({
      units: {
        Escrow: {
          name: "Escrow",
          contract: "Escrow",
          script: "X.s.sol:X",
          produces: [],
          constructorDeps: ["MissingFactory"],
          wiringPeers: [],
          configureScripts: [],
        },
      },
    });
    assert.throws(
      () => assertManifest(raw, "test.json"),
      /constructorDeps references unknown unit "MissingFactory"/,
    );
  });

  it("accepts a multi-output unit with outputs map", () => {
    const raw = baseManifest({
      units: {
        Stack: {
          name: "Stack",
          contract: "Executor",
          script: "X.s.sol:X",
          produces: ["EXEC_ADDRESS", "POOL_ADDRESS"],
          outputs: {
            EXEC_ADDRESS: {
              contract: "Executor",
              contractPath: "src/Executor.sol:Executor",
              sdkExport: "executor",
            },
            POOL_ADDRESS: {
              contract: "Pool",
              contractPath: "src/Pool.sol:Pool",
              sdkExport: "pool",
            },
          },
          constructorDeps: [],
          wiringPeers: [],
          configureScripts: [],
        },
      },
    });
    const m = assertManifest(raw, "test.json");
    assert.equal(m.units.Stack.outputs?.EXEC_ADDRESS.contract, "Executor");
    assert.equal(m.units.Stack.outputs?.POOL_ADDRESS.sdkExport, "pool");
  });

  it("rejects outputs key that is not in produces", () => {
    const raw = baseManifest({
      units: {
        Stack: {
          name: "Stack",
          contract: "X",
          script: "X.s.sol:X",
          produces: ["A_ADDRESS"],
          outputs: {
            B_ADDRESS: { contract: "B" },
          },
          constructorDeps: [],
          wiringPeers: [],
          configureScripts: [],
        },
      },
    });
    assert.throws(
      () => assertManifest(raw, "test.json"),
      /outputs key "B_ADDRESS" is not listed in produces/,
    );
  });

  it("accepts state.addresses with per-produces map", () => {
    const raw = baseManifest({
      units: {
        Stack: {
          name: "Stack",
          contract: "X",
          script: "X.s.sol:X",
          produces: ["A_ADDRESS", "B_ADDRESS"],
          constructorDeps: [],
          wiringPeers: [],
          configureScripts: [],
          state: {
            address: "0x0000000000000000000000000000000000000001",
            addresses: {
              A_ADDRESS: "0x0000000000000000000000000000000000000001",
              B_ADDRESS: "0x0000000000000000000000000000000000000002",
            },
          },
        },
      },
    });
    const m = assertManifest(raw, "test.json");
    assert.equal(
      m.units.Stack.state?.addresses?.B_ADDRESS,
      "0x0000000000000000000000000000000000000002",
    );
  });

  it("rejects non-string value in state.addresses", () => {
    const raw = baseManifest({
      units: {
        Stack: {
          name: "Stack",
          contract: "X",
          script: "X.s.sol:X",
          produces: ["A_ADDRESS"],
          constructorDeps: [],
          wiringPeers: [],
          configureScripts: [],
          state: { addresses: { A_ADDRESS: 42 } },
        },
      },
    });
    assert.throws(
      () => assertManifest(raw, "test.json"),
      /state.addresses\[A_ADDRESS\] must be string/,
    );
  });

  it("validates wiringPeers ref syntax at load time", () => {
    const raw = baseManifest({
      units: {
        Bridge: {
          name: "Bridge",
          contract: "Bridge",
          script: "X.s.sol:X",
          produces: [],
          constructorDeps: [],
          wiringPeers: ["badformat"],
          configureScripts: [],
        },
      },
    });
    assert.throws(() => assertManifest(raw, "test.json"), /missing ':'/);
  });
});

describe("assertCrossEnvRefs", () => {
  it("accepts manifests with symmetric cross-env twin + wiring", () => {
    const eth: Manifest = baseManifest({
      env: "ethereal-testnet",
      bundle: "testnet",
      units: {
        Bridge: {
          name: "Bridge",
          contract: "Bridge",
          script: "X.s.sol:X",
          produces: [],
          constructorDeps: [],
          wiringPeers: ["arbitrum:BridgeRemote"],
          configureScripts: [],
        },
      },
    });
    const arb: Manifest = baseManifest({
      env: "arbitrum",
      bundle: "testnet",
      chain: { name: "Arbitrum Sepolia", chainId: 421614 },
      units: {
        BridgeRemote: {
          name: "BridgeRemote",
          contract: "BridgeRemote",
          script: "Y.s.sol:Y",
          produces: [],
          constructorDeps: [],
          wiringPeers: ["ethereal-testnet:Bridge"],
          configureScripts: [],
        },
      },
    });
    assert.doesNotThrow(() =>
      assertCrossEnvRefs({
        "ethereal-testnet": eth,
        "ethereal-mainnet": undefined,
        polygon: undefined,
        arbitrum: arb,
      }),
    );
  });

  it("rejects dangling wiringPeer pointer", () => {
    const eth: Manifest = baseManifest({
      env: "ethereal-testnet",
      bundle: "testnet",
      units: {
        Bridge: {
          name: "Bridge",
          contract: "Bridge",
          script: "X.s.sol:X",
          produces: [],
          constructorDeps: [],
          wiringPeers: ["arbitrum:Ghost"],
          configureScripts: [],
        },
      },
    });
    const arb: Manifest = baseManifest({
      env: "arbitrum",
      bundle: "testnet",
      chain: { name: "Arbitrum Sepolia", chainId: 421614 },
    });
    assert.throws(
      () =>
        assertCrossEnvRefs({
          "ethereal-testnet": eth,
          "ethereal-mainnet": undefined,
          polygon: undefined,
          arbitrum: arb,
        }),
      /references missing unit arbitrum:Ghost/,
    );
  });

  it("rejects asymmetric wiringPeer (B does not list A back)", () => {
    const eth: Manifest = baseManifest({
      env: "ethereal-testnet",
      bundle: "testnet",
      units: {
        Bridge: {
          name: "Bridge",
          contract: "Bridge",
          script: "X.s.sol:X",
          produces: [],
          constructorDeps: [],
          wiringPeers: ["arbitrum:BridgeRemote"],
          configureScripts: [],
        },
      },
    });
    const arb: Manifest = baseManifest({
      env: "arbitrum",
      bundle: "testnet",
      chain: { name: "Arbitrum Sepolia", chainId: 421614 },
      units: {
        BridgeRemote: {
          name: "BridgeRemote",
          contract: "BridgeRemote",
          script: "Y.s.sol:Y",
          produces: [],
          constructorDeps: [],
          wiringPeers: [],
          configureScripts: [],
        },
      },
    });
    assert.throws(
      () =>
        assertCrossEnvRefs({
          "ethereal-testnet": eth,
          "ethereal-mainnet": undefined,
          polygon: undefined,
          arbitrum: arb,
        }),
      /wiringPeers must be symmetric/,
    );
  });

  it("rejects dangling twinOf pointer", () => {
    const eth: Manifest = baseManifest({
      env: "ethereal-testnet",
      bundle: "testnet",
      units: {
        Factory: {
          name: "Factory",
          contract: "Factory",
          script: "X.s.sol:X",
          produces: [],
          constructorDeps: [],
          wiringPeers: [],
          twinOf: "arbitrum:Factory",
          configureScripts: [],
        },
      },
    });
    const arb: Manifest = baseManifest({
      env: "arbitrum",
      bundle: "testnet",
      chain: { name: "Arbitrum Sepolia", chainId: 421614 },
    });
    assert.throws(
      () =>
        assertCrossEnvRefs({
          "ethereal-testnet": eth,
          "ethereal-mainnet": undefined,
          polygon: undefined,
          arbitrum: arb,
        }),
      /twinOf references missing unit arbitrum:Factory/,
    );
  });

  it("rejects asymmetric twinOf (B.twinOf does not point back to A)", () => {
    const eth: Manifest = baseManifest({
      env: "ethereal-testnet",
      bundle: "testnet",
      units: {
        Factory: {
          name: "Factory",
          contract: "Factory",
          script: "X.s.sol:X",
          produces: [],
          constructorDeps: [],
          wiringPeers: [],
          twinOf: "arbitrum:Factory",
          configureScripts: [],
        },
      },
    });
    const arb: Manifest = baseManifest({
      env: "arbitrum",
      bundle: "testnet",
      chain: { name: "Arbitrum Sepolia", chainId: 421614 },
      units: {
        Factory: {
          name: "Factory",
          contract: "Factory",
          script: "Y.s.sol:Y",
          produces: [],
          constructorDeps: [],
          wiringPeers: [],
          configureScripts: [],
        },
      },
    });
    assert.throws(
      () =>
        assertCrossEnvRefs({
          "ethereal-testnet": eth,
          "ethereal-mainnet": undefined,
          polygon: undefined,
          arbitrum: arb,
        }),
      /twinOf must be symmetric/,
    );
  });

  it("rejects cross-bundle twinOf (testnet -> mainnet)", () => {
    const eth: Manifest = baseManifest({
      env: "ethereal-testnet",
      bundle: "testnet",
      units: {
        Factory: {
          name: "Factory",
          contract: "Factory",
          script: "X.s.sol:X",
          produces: [],
          constructorDeps: [],
          wiringPeers: [],
          twinOf: "arbitrum:Factory",
          configureScripts: [],
        },
      },
    });
    const arb: Manifest = baseManifest({
      env: "arbitrum",
      bundle: "mainnet", // different bundle on purpose
      chain: { name: "Arbitrum One", chainId: 42161 },
      units: {
        Factory: {
          name: "Factory",
          contract: "Factory",
          script: "Y.s.sol:Y",
          produces: [],
          constructorDeps: [],
          wiringPeers: [],
          twinOf: "ethereal-testnet:Factory",
          configureScripts: [],
        },
      },
    });
    assert.throws(
      () =>
        assertCrossEnvRefs({
          "ethereal-testnet": eth,
          "arbitrum-sepolia": undefined,
          "ethereal-mainnet": undefined,
          polygon: undefined,
          arbitrum: arb,
        }),
      /bundles must stay isolated/,
    );
  });

  it("rejects cross-bundle wiringPeer (mainnet -> testnet)", () => {
    const eth: Manifest = baseManifest({
      env: "ethereal-mainnet",
      bundle: "mainnet",
      chain: { name: "Ethereal", chainId: 5064014 },
      units: {
        Bridge: {
          name: "Bridge",
          contract: "Bridge",
          script: "X.s.sol:X",
          produces: [],
          constructorDeps: [],
          wiringPeers: ["arbitrum-sepolia:BridgeRemote"],
          configureScripts: [],
        },
      },
    });
    const arbSep: Manifest = baseManifest({
      env: "arbitrum-sepolia",
      bundle: "testnet", // different bundle on purpose
      chain: { name: "Arbitrum Sepolia", chainId: 421614 },
      units: {
        BridgeRemote: {
          name: "BridgeRemote",
          contract: "BridgeRemote",
          script: "Y.s.sol:Y",
          produces: [],
          constructorDeps: [],
          wiringPeers: ["ethereal-mainnet:Bridge"],
          configureScripts: [],
        },
      },
    });
    assert.throws(
      () =>
        assertCrossEnvRefs({
          "ethereal-testnet": undefined,
          "arbitrum-sepolia": arbSep,
          "ethereal-mainnet": eth,
          polygon: undefined,
          arbitrum: undefined,
        }),
      /bundles must stay isolated/,
    );
  });

  it("accepts symmetric twinOf (both sides declare each other)", () => {
    const eth: Manifest = baseManifest({
      env: "ethereal-testnet",
      bundle: "testnet",
      units: {
        Factory: {
          name: "Factory",
          contract: "Factory",
          script: "X.s.sol:X",
          produces: [],
          constructorDeps: [],
          wiringPeers: [],
          twinOf: "arbitrum:Factory",
          configureScripts: [],
        },
      },
    });
    const arb: Manifest = baseManifest({
      env: "arbitrum",
      bundle: "testnet",
      chain: { name: "Arbitrum Sepolia", chainId: 421614 },
      units: {
        Factory: {
          name: "Factory",
          contract: "Factory",
          script: "Y.s.sol:Y",
          produces: [],
          constructorDeps: [],
          wiringPeers: [],
          twinOf: "ethereal-testnet:Factory",
          configureScripts: [],
        },
      },
    });
    assert.doesNotThrow(() =>
      assertCrossEnvRefs({
        "ethereal-testnet": eth,
        "ethereal-mainnet": undefined,
        polygon: undefined,
        arbitrum: arb,
      }),
    );
  });
});

describe("bridgeEnabled flag", () => {
  function unit(overrides: Partial<DeployUnit> = {}): DeployUnit {
    return {
      name: "U",
      contract: "U",
      script: "X.s.sol:X",
      produces: [],
      constructorDeps: [],
      wiringPeers: [],
      configureScripts: [],
      ...overrides,
    };
  }

  it("rejects a non-boolean bridgeEnabled", () => {
    const raw = { ...baseManifest(), bridgeEnabled: "false" };
    assert.throws(
      () => assertManifest(raw, "test.json"),
      /bridgeEnabled must be boolean/,
    );
  });

  it("round-trips bridgeEnabled: false", () => {
    const m = assertManifest(
      baseManifest({ bridgeEnabled: false }),
      "test.json",
    );
    assert.equal(m.bridgeEnabled, false);
  });

  it("isBridgeUnit is true for twin or wiring-peer units only", () => {
    assert.equal(isBridgeUnit(unit()), false);
    assert.equal(
      isBridgeUnit(unit({ twinOf: "arbitrum:U" })),
      true,
    );
    assert.equal(
      isBridgeUnit(unit({ wiringPeers: ["arbitrum:U"] })),
      true,
    );
  });

  it("isUnitActive gates bridge units only when bridge is disabled", () => {
    const bridge = unit({ wiringPeers: ["arbitrum:U"] });
    const plain = unit();
    const off = baseManifest({ bridgeEnabled: false });
    const on = baseManifest({ bridgeEnabled: true });
    assert.equal(isUnitActive(off, bridge), false);
    assert.equal(isUnitActive(off, plain), true); // non-bridge stays active
    assert.equal(isUnitActive(on, bridge), true);
    assert.equal(isUnitActive(baseManifest(), bridge), true); // default = enabled
  });

  it("assertCrossEnvRefs skips a bridge unit's symmetry when bridge disabled", () => {
    // A dangling wiringPeer would normally throw; bridgeEnabled:false makes the
    // bridge unit inert so a standalone deploy validates cleanly.
    const standalone = baseManifest({
      env: "robinhood-testnet",
      bridgeEnabled: false,
      units: {
        Bridge: {
          name: "Bridge",
          contract: "Bridge",
          script: "B.s.sol:B",
          produces: [],
          constructorDeps: [],
          wiringPeers: ["arbitrum-sepolia:DoesNotExist"],
          configureScripts: [],
        },
      },
    });
    assert.doesNotThrow(() =>
      assertCrossEnvRefs({
        "robinhood-testnet": standalone,
      } as Parameters<typeof assertCrossEnvRefs>[0]),
    );

    // Same manifest with the bridge enabled must fail on the dangling peer.
    const enabled = { ...standalone, bridgeEnabled: true };
    assert.throws(
      () =>
        assertCrossEnvRefs({
          "robinhood-testnet": enabled,
        } as Parameters<typeof assertCrossEnvRefs>[0]),
      /references missing unit/,
    );
  });
});
