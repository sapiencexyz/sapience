import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildExports,
  emitExportBlock,
  generateSdkAddresses,
  mergeWithExisting,
  parseExportBlock,
  replaceExportBlock,
} from "../sync-sdk.ts";
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
  chainId: number,
  units: DeployUnit[],
): Manifest {
  return {
    env,
    bundle: "testnet",
    chain: { name: env, chainId },
    units: Object.fromEntries(units.map((u) => [u.name, u])),
  };
}

// ---------- buildExports ----------

describe("buildExports", () => {
  it("groups units by sdkExport across manifests", () => {
    const eth = manifest("ethereal-testnet", 13374202, [
      {
        ...unit("Factory", { sdkExport: "predictionMarketTokenFactory" }),
        state: { address: "0xfa", blockCreated: 100 },
      },
    ]);
    const arb = manifest("arbitrum-sepolia", 421614, [
      {
        ...unit("Factory", { sdkExport: "predictionMarketTokenFactory" }),
        state: { address: "0xfb", blockCreated: 200 },
      },
    ]);
    const out = buildExports({
      "ethereal-testnet": eth,
      "arbitrum-sepolia": arb,
    });
    assert.equal(Object.keys(out).length, 1);
    const exp = out["predictionMarketTokenFactory"];
    assert.equal(exp.size, 2);
    assert.equal(exp.get(13374202)?.address, "0xfa");
    assert.equal(exp.get(421614)?.address, "0xfb");
  });

  it("skips units without sdkExport or without state.address", () => {
    const eth = manifest("ethereal-testnet", 13374202, [
      unit("NoExport"),
      { ...unit("NoAddr", { sdkExport: "foo" }) }, // no state
      {
        ...unit("Good", { sdkExport: "good" }),
        state: { address: "0xab" },
      },
    ]);
    const out = buildExports({ "ethereal-testnet": eth });
    assert.deepEqual(Object.keys(out), ["good"]);
  });

  it("fans a multi-output unit into one export per outputs entry", () => {
    const eth = manifest("ethereal-testnet", 13374202, [
      {
        ...unit("Stack", {
          contract: "Executor",
          produces: ["EXEC_ADDRESS", "POOL_ADDRESS"],
          outputs: {
            EXEC_ADDRESS: { contract: "Executor", sdkExport: "executor" },
            POOL_ADDRESS: { contract: "Pool", sdkExport: "pool" },
          },
        }),
        state: {
          address: "0xexec",
          addresses: { EXEC_ADDRESS: "0xexec", POOL_ADDRESS: "0xpool" },
          blockCreated: 42,
        },
      },
    ]);
    const out = buildExports({ "ethereal-testnet": eth });
    assert.equal(out.executor.get(13374202)?.address, "0xexec");
    assert.equal(out.pool.get(13374202)?.address, "0xpool");
    assert.equal(out.pool.get(13374202)?.blockCreated, 42);
  });

  it("propagates per-key legacy snapshots into the matching export", () => {
    const eth = manifest("ethereal-testnet", 13374202, [
      {
        ...unit("Stack", {
          contract: "Executor",
          produces: ["EXEC_ADDRESS", "POOL_ADDRESS"],
          outputs: {
            EXEC_ADDRESS: { contract: "Executor", sdkExport: "executor" },
            POOL_ADDRESS: { contract: "Pool", sdkExport: "pool" },
          },
        }),
        state: {
          address: "0xexec_new",
          addresses: {
            EXEC_ADDRESS: "0xexec_new",
            POOL_ADDRESS: "0xpool_new",
          },
          legacy: [
            {
              address: "0xexec_old",
              addresses: {
                EXEC_ADDRESS: "0xexec_old",
                POOL_ADDRESS: "0xpool_old",
              },
              blockCreated: 100,
            },
          ],
        },
      },
    ]);
    const out = buildExports({ "ethereal-testnet": eth });
    assert.deepEqual(
      out.executor.get(13374202)?.legacy.map((l) => l.address),
      ["0xexec_old"],
    );
    assert.deepEqual(
      out.pool.get(13374202)?.legacy.map((l) => l.address),
      ["0xpool_old"],
    );
  });

  it("propagates blockCreated + legacy[] from state", () => {
    const eth = manifest("ethereal-testnet", 13374202, [
      {
        ...unit("Foo", { sdkExport: "fooExport" }),
        state: {
          address: "0xnew",
          blockCreated: 999,
          legacy: [
            { address: "0xold1", blockCreated: 500 },
            { address: "0xold2" },
          ],
        },
      },
    ]);
    const out = buildExports({ "ethereal-testnet": eth });
    const entry = out.fooExport.get(13374202)!;
    assert.equal(entry.blockCreated, 999);
    assert.equal(entry.legacy.length, 2);
    assert.equal(entry.legacy[0].address, "0xold1");
  });
});

// ---------- emitExportBlock ----------

describe("emitExportBlock", () => {
  it("emits chainIds sorted ascending, addresses + blockCreated + empty legacy", () => {
    const m = new Map([
      [42161, { address: "0xaa", legacy: [] }],
      [13374202, { address: "0xbb", blockCreated: 12, legacy: [] }],
    ]);
    const src = emitExportBlock("foo", m);
    // chainIds asc: 42161 then 13374202
    const first = src.indexOf("42161:");
    const second = src.indexOf("13374202:");
    assert.ok(first >= 0 && second > first);
    assert.match(src, /address: '0xaa'/);
    assert.match(src, /blockCreated: 12,/);
    assert.match(src, /legacy: \[\] as const,/);
  });

  it("emits legacy entries inline as { address, blockCreated? }", () => {
    const m = new Map([
      [
        1,
        {
          address: "0xcurrent",
          blockCreated: 100,
          legacy: [
            { address: "0xold1", blockCreated: 50 },
            { address: "0xold2" },
          ],
        },
      ],
    ]);
    const src = emitExportBlock("foo", m);
    assert.match(src, /\{ address: '0xold1', blockCreated: 50 \},/);
    assert.match(src, /\{ address: '0xold2' \},/);
  });

  it("wraps with `export const NAME: ChainAddressMap = { … } as const;`", () => {
    const m = new Map([[1, { address: "0x", legacy: [] }]]);
    const src = emitExportBlock("foo", m);
    assert.ok(src.startsWith("export const foo: ChainAddressMap = {"));
    assert.ok(src.endsWith("} as const;"));
  });
});

// ---------- replaceExportBlock ----------

describe("replaceExportBlock", () => {
  it("swaps in the new block, leaving surrounding code intact", () => {
    const source = `
import type { Address } from 'viem';

export const collateralToken: ChainAddressMap = {
  1: { address: '0xold', legacy: [] as const },
} as const;

export const eas: ChainAddressMap = {
  2: { address: '0xeas', legacy: [] as const },
} as const;
`;
    const newBlock = "export const collateralToken: ChainAddressMap = {\n  1: {\n    address: '0xnew',\n    legacy: [] as const,\n  },\n} as const;";
    const { source: after, replaced } = replaceExportBlock(
      source,
      "collateralToken",
      newBlock,
    );
    assert.equal(replaced, true);
    assert.match(after, /'0xnew'/);
    assert.ok(!after.includes("'0xold'"));
    // eas untouched
    assert.match(after, /eas:.*'0xeas'/s);
  });

  it("handles nested braces inside legacy[] without closing early", () => {
    const source = `
export const foo: ChainAddressMap = {
  1: {
    address: '0xa',
    legacy: [
      { address: '0xb', blockCreated: 5 },
      { address: '0xc' },
    ] as const,
  },
} as const;
`;
    const { source: after, replaced } = replaceExportBlock(
      source,
      "foo",
      "export const foo: ChainAddressMap = {\n  1: { address: '0xX', legacy: [] as const },\n} as const;",
    );
    assert.equal(replaced, true);
    assert.match(after, /'0xX'/);
    assert.ok(!after.includes("'0xa'"));
    assert.ok(!after.includes("'0xb'"));
  });

  it("returns replaced=false when the export is not in the source", () => {
    const { source: after, replaced } = replaceExportBlock(
      "no exports here\n",
      "missing",
      "...",
    );
    assert.equal(replaced, false);
    assert.equal(after, "no exports here\n");
  });
});

// ---------- generateSdkAddresses ----------

describe("generateSdkAddresses", () => {
  const baseSource = `import type { Address } from 'viem';

export const eas: ChainAddressMap = {
  1: { address: '0xeas', legacy: [] as const },
} as const;

export const foo: ChainAddressMap = {
  1: { address: '0xfooOld', blockCreated: 1, legacy: [] as const },
} as const;
`;

  it("regenerates owned exports + leaves untouched exports alone", () => {
    const eth = manifest("ethereal-testnet", 1, [
      {
        ...unit("FooUnit", { sdkExport: "foo" }),
        state: { address: "0xfooNew", blockCreated: 2 },
      },
    ]);
    const result = generateSdkAddresses(
      { "ethereal-testnet": eth },
      baseSource,
    );
    assert.deepEqual(result.ownedExports, ["foo"]);
    assert.match(result.source, /'0xfooNew'/);
    assert.match(result.source, /'0xeas'/); // still here
    assert.ok(!result.source.includes("'0xfooOld'"));
  });

  it("reports missingExports when a sdkExport has no matching block", () => {
    const eth = manifest("ethereal-testnet", 1, [
      {
        ...unit("Ghost", { sdkExport: "doesNotExist" }),
        state: { address: "0xghost" },
      },
    ]);
    const result = generateSdkAddresses(
      { "ethereal-testnet": eth },
      baseSource,
    );
    assert.deepEqual(result.missingExports, ["doesNotExist"]);
    assert.deepEqual(result.ownedExports, []);
  });

  it("returns the original source when nothing claimed by manifests is in the file", () => {
    const eth = manifest("ethereal-testnet", 1, []);
    const result = generateSdkAddresses(
      { "ethereal-testnet": eth },
      baseSource,
    );
    assert.equal(result.source, baseSource);
  });

  it("preserves chainId entries the manifests don't claim (no orphan drop)", () => {
    const sourceWithExtraChain = `export const foo: ChainAddressMap = {
  1: { address: '0xchain1', blockCreated: 100, legacy: [] as const },
  999: { address: '0xexternal', legacy: [] as const },
} as const;
`;
    const eth = manifest("ethereal-testnet", 1, [
      {
        ...unit("FooUnit", { sdkExport: "foo" }),
        state: { address: "0xchain1New", blockCreated: 101 },
      },
    ]);
    const result = generateSdkAddresses(
      { "ethereal-testnet": eth },
      sourceWithExtraChain,
    );
    // Manifest's chain (1) was updated:
    assert.match(result.source, /'0xchain1New'/);
    // External chain (999) is preserved verbatim:
    assert.match(result.source, /'0xexternal'/);
    assert.match(result.source, /999:/);
  });
});

// ---------- parseExportBlock ----------

describe("parseExportBlock", () => {
  it("reads addresses + blockCreated + legacy entries out of an existing block", () => {
    const source = `export const foo: ChainAddressMap = {
  42161: {
    address: '0xmain',
    blockCreated: 999,
    legacy: [
      { address: '0xold1', blockCreated: 100 },
      { address: '0xold2' },
    ] as const,
  },
  13374202: {
    address: '0xtest',
    legacy: [] as const,
  },
} as const;
`;
    const parsed = parseExportBlock(source, "foo")!;
    assert.equal(parsed.size, 2);
    const main = parsed.get(42161)!;
    assert.equal(main.address, "0xmain");
    assert.equal(main.blockCreated, 999);
    assert.equal(main.legacy.length, 2);
    assert.equal(main.legacy[0].address, "0xold1");
    assert.equal(main.legacy[0].blockCreated, 100);
    assert.equal(main.legacy[1].address, "0xold2");
    assert.equal(main.legacy[1].blockCreated, undefined);
    const test = parsed.get(13374202)!;
    assert.equal(test.address, "0xtest");
    assert.deepEqual(test.legacy, []);
  });

  it("accepts legacy entries in bare-string form (Address)", () => {
    // The SDK's LegacyContractEntry union allows raw address strings too.
    const source = `export const foo: ChainAddressMap = {
  1: { address: '0xcurrent', legacy: ['0xstringLegacy'] as const },
} as const;
`;
    const parsed = parseExportBlock(source, "foo")!;
    assert.equal(parsed.get(1)!.legacy[0].address, "0xstringLegacy");
  });

  it("returns undefined when the export is absent", () => {
    assert.equal(parseExportBlock("nothing here", "foo"), undefined);
  });
});

// ---------- mergeWithExisting ----------

describe("mergeWithExisting", () => {
  it("preserves chainIds present only in `existing`", () => {
    const manifest = new Map([[1, { address: "0xa", legacy: [] }]]);
    const existing = new Map([[999, { address: "0xext", legacy: [] }]]);
    const merged = mergeWithExisting(manifest, existing);
    assert.equal(merged.size, 2);
    assert.equal(merged.get(999)!.address, "0xext");
  });

  it("manifest wins on conflicts", () => {
    const manifest = new Map([
      [1, { address: "0xnew", blockCreated: 200, legacy: [] }],
    ]);
    const existing = new Map([
      [1, { address: "0xold", blockCreated: 100, legacy: [] }],
    ]);
    const merged = mergeWithExisting(manifest, existing);
    assert.equal(merged.get(1)!.address, "0xnew");
    assert.equal(merged.get(1)!.blockCreated, 200);
  });

  it("returns just the manifest entries when there's no existing block", () => {
    const manifest = new Map([[1, { address: "0xa", legacy: [] }]]);
    const merged = mergeWithExisting(manifest, undefined);
    assert.equal(merged.size, 1);
  });
});
