import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  lookupAddress,
  lookupSdkAddress,
  normalizeRuntimeBytecode,
  populate,
  readArtifactHashes,
  stripMetadataTrailer,
  type SdkAddressMap,
} from "../populate.ts";
import type { Manifest } from "../schema.ts";

// ---------- fixture helpers ----------

/**
 * Build a tiny self-contained protocol root with: out/<C>.sol/<C>.json
 * artifacts and deployment/<bundle>/config.json files.
 *
 * Layout:
 *   <root>/out/Foo.sol/Foo.json
 *   <root>/deployment/testnet/config.json
 *   <manifestDir>/ethereal-testnet.json
 *   <manifestDir>/ethereal-mainnet.json
 *   <manifestDir>/polygon.json
 *   <manifestDir>/arbitrum.json
 */
async function buildFixture(): Promise<{
  protocolRoot: string;
  manifestDir: string;
  cleanup: () => void;
}> {
  const root = mkdtempSync(join(tmpdir(), "manifest-fixture-"));
  const protocolRoot = join(root, "protocol");
  const manifestDir = join(protocolRoot, "manifest");
  await mkdir(join(protocolRoot, "out", "Foo.sol"), { recursive: true });
  await mkdir(join(protocolRoot, "out", "Bar.sol"), { recursive: true });
  await mkdir(join(protocolRoot, "deployment", "testnet"), {
    recursive: true,
  });
  await mkdir(join(protocolRoot, "deployment", "mainnet"), {
    recursive: true,
  });
  await mkdir(manifestDir, { recursive: true });

  await writeFile(
    join(protocolRoot, "out", "Foo.sol", "Foo.json"),
    JSON.stringify({
      bytecode: { object: "0xdeadbeef" },
      deployedBytecode: { object: "0xfeedface" },
    }),
  );
  await writeFile(
    join(protocolRoot, "out", "Bar.sol", "Bar.json"),
    JSON.stringify({
      bytecode: { object: "0x1234" },
      deployedBytecode: { object: "0x5678" },
    }),
  );
  await writeFile(
    join(protocolRoot, "deployment", "testnet", "config.json"),
    JSON.stringify({ FOO_ADDRESS: "0xaa00", BAR_ADDRESS: "0xbb00" }),
  );
  await writeFile(
    join(protocolRoot, "deployment", "mainnet", "config.json"),
    JSON.stringify({}),
  );

  // Minimal manifests: only ethereal-testnet has units, others are empty.
  const etManifest: Manifest = {
    env: "ethereal-testnet",
    bundle: "testnet",
    chain: { name: "Ethereal Testnet", chainId: 13374202 },
    units: {
      Foo: {
        name: "Foo",
        contract: "Foo",
        script: "Deploy.s.sol:Deploy",
        produces: ["FOO_ADDRESS"],
        constructorDeps: [],
        wiringPeers: [],
        configureScripts: [],
      },
      Bar: {
        name: "Bar",
        contract: "Bar",
        script: "Deploy.s.sol:Deploy",
        produces: ["BAR_ADDRESS"],
        constructorDeps: [],
        wiringPeers: [],
        configureScripts: [],
      },
    },
  };
  for (const env of [
    "ethereal-testnet",
    "ethereal-mainnet",
    "polygon",
    "arbitrum",
  ]) {
    const m: Manifest =
      env === "ethereal-testnet"
        ? etManifest
        : {
            env: env as Manifest["env"],
            bundle: env === "polygon" || env === "ethereal-mainnet" ? "mainnet" : "testnet",
            chain: { name: env, chainId: 0 },
            units: {},
          };
    await writeFile(
      join(manifestDir, `${env}.json`),
      JSON.stringify(m, null, 2),
    );
  }

  return {
    protocolRoot,
    manifestDir,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

// ---------- lookupAddress ----------

describe("lookupAddress", () => {
  it("returns the first matching produces key", () => {
    const cfg = { FOO_ADDRESS: "0xabc", BAR_ADDRESS: "0xdef" };
    assert.equal(lookupAddress(["FOO_ADDRESS"], cfg), "0xabc");
    assert.equal(lookupAddress(["BAR_ADDRESS"], cfg), "0xdef");
    assert.equal(lookupAddress(["FOO_ADDRESS", "BAR_ADDRESS"], cfg), "0xabc");
  });

  it("falls through missing keys", () => {
    const cfg = { BAR_ADDRESS: "0xdef" };
    assert.equal(lookupAddress(["FOO_ADDRESS", "BAR_ADDRESS"], cfg), "0xdef");
  });

  it("returns undefined when nothing matches", () => {
    assert.equal(lookupAddress(["MISSING"], {}), undefined);
  });

  it("ignores non-string values", () => {
    assert.equal(lookupAddress(["FOO_ADDRESS"], { FOO_ADDRESS: 42 }), undefined);
  });
});

// ---------- lookupSdkAddress ----------

describe("lookupSdkAddress", () => {
  const sdk: SdkAddressMap = {
    manualConditionResolver: {
      5064014: { address: "0xMAIN" },
      13374202: { address: "0xTEST" },
    },
    conditionalTokensReader: {
      137: { address: "0xPOLY" },
    },
  };

  it("returns the address for a known export + chainId", () => {
    assert.equal(
      lookupSdkAddress(sdk, "manualConditionResolver", 5064014),
      "0xMAIN",
    );
    assert.equal(
      lookupSdkAddress(sdk, "conditionalTokensReader", 137),
      "0xPOLY",
    );
  });

  it("accepts string-keyed chainId entries (defensive)", () => {
    const sdkStrKeys: SdkAddressMap = {
      foo: { "42": { address: "0xstr" } },
    };
    assert.equal(lookupSdkAddress(sdkStrKeys, "foo", 42), "0xstr");
  });

  it("returns undefined when exportName is missing", () => {
    assert.equal(lookupSdkAddress(sdk, undefined, 5064014), undefined);
  });

  it("returns undefined when the export is not in the SDK", () => {
    assert.equal(lookupSdkAddress(sdk, "nonexistent", 5064014), undefined);
  });

  it("returns undefined when the chainId is not in the export", () => {
    assert.equal(
      lookupSdkAddress(sdk, "manualConditionResolver", 137),
      undefined,
    );
  });
});

// ---------- readArtifactHashes ----------

describe("stripMetadataTrailer", () => {
  // CBOR-ish metadata of arbitrary 5 bytes "deadbeefca" + length suffix
  // 0x0005 (5 bytes). Total trailer = 5 + 2 = 7 bytes = 14 hex chars.
  const code = "0xfe60a01b" + "deadbeefca" + "0005";

  it("removes the metadata bytes + the 2-byte length suffix", () => {
    assert.equal(stripMetadataTrailer(code), "0xfe60a01b");
  });

  it("treats two bytecodes that differ only in metadata as equal post-strip", () => {
    const a = "0xfe60a01b" + "aabbccddee" + "0005";
    const b = "0xfe60a01b" + "1122334455" + "0005";
    assert.equal(stripMetadataTrailer(a), stripMetadataTrailer(b));
  });

  it("returns input unchanged when the encoded length is implausibly large", () => {
    // Last 2 bytes = 0xffff = 65535: way too big for a real metadata blob.
    // Conservative: leave the hex alone rather than corrupt it.
    const weird = "0xdead" + "ffff";
    assert.equal(stripMetadataTrailer(weird), weird);
  });

  it("returns input unchanged when the encoded length is 0", () => {
    const noTrailer = "0xdeadbeef" + "0000";
    assert.equal(stripMetadataTrailer(noTrailer), noTrailer);
  });

  it("returns input unchanged when the hex is shorter than the declared trailer", () => {
    // Length suffix = 0x0010 (16 bytes) but the hex is too short for that.
    const tooShort = "0xabcd" + "0010";
    assert.equal(stripMetadataTrailer(tooShort), tooShort);
  });

  it("preserves the 0x prefix", () => {
    const stripped = stripMetadataTrailer(code);
    assert.equal(stripped.startsWith("0x"), true);
  });

  it("handles hex without 0x prefix", () => {
    const noPrefix = code.slice(2);
    assert.equal(stripMetadataTrailer(noPrefix), "fe60a01b");
  });
});

describe("normalizeRuntimeBytecode", () => {
  it("zeroes the specified byte ranges", () => {
    // 16 bytes total: aabbccdd_eeff0011_22334455_66778899
    const code =
      "0xaabbccddeeff0011" + "2233445566778899";
    const out = normalizeRuntimeBytecode(code, [{ start: 4, length: 4 }]);
    // Bytes 4..8 (eeff0011) zeroed:
    assert.equal(out, "0xaabbccdd00000000" + "2233445566778899");
  });

  it("returns input unchanged when refs is empty/undefined", () => {
    const code = "0xdeadbeef";
    assert.equal(normalizeRuntimeBytecode(code, []), code);
    assert.equal(normalizeRuntimeBytecode(code, undefined), code);
  });

  it("makes two bytecodes that differ only in immutable values hash-equal", () => {
    const a = "0xaabbccdd" + "1111111122222222" + "ee";
    const b = "0xaabbccdd" + "3333333344444444" + "ee";
    const refs = [{ start: 4, length: 8 }];
    assert.equal(
      normalizeRuntimeBytecode(a, refs),
      normalizeRuntimeBytecode(b, refs),
    );
  });

  it("clamps refs that extend past the end of bytecode", () => {
    const code = "0xdeadbeef"; // 4 bytes
    const out = normalizeRuntimeBytecode(code, [{ start: 2, length: 99 }]);
    assert.equal(out, "0xdead0000");
  });

  it("ignores refs whose start is past the end", () => {
    const code = "0xdeadbeef";
    const out = normalizeRuntimeBytecode(code, [{ start: 99, length: 4 }]);
    assert.equal(out, code);
  });
});

describe("readArtifactHashes", () => {
  let fx: Awaited<ReturnType<typeof buildFixture>>;
  before(async () => {
    fx = await buildFixture();
  });
  after(() => fx.cleanup());

  it("hashes deployedBytecode and creation bytecode", async () => {
    const h = await readArtifactHashes("Foo", join(fx.protocolRoot, "out"));
    assert.equal(h.artifactMissing, undefined);
    // sha256 produces 32-byte hex digest => 64 chars + '0x'
    assert.match(h.bytecodeHash ?? "", /^0x[0-9a-f]{64}$/);
    assert.match(h.creationCodeHash ?? "", /^0x[0-9a-f]{64}$/);
    // Different inputs -> different hashes
    assert.notEqual(h.bytecodeHash, h.creationCodeHash);
  });

  it("is stable across calls (same bytes -> same hash)", async () => {
    const a = await readArtifactHashes("Foo", join(fx.protocolRoot, "out"));
    const b = await readArtifactHashes("Foo", join(fx.protocolRoot, "out"));
    assert.equal(a.bytecodeHash, b.bytecodeHash);
  });

  it("flags missing artifact instead of throwing", async () => {
    const h = await readArtifactHashes(
      "Nonexistent",
      join(fx.protocolRoot, "out"),
    );
    assert.equal(h.artifactMissing, true);
    assert.equal(h.bytecodeHash, undefined);
  });
});

// ---------- populate ----------

describe("populate", () => {
  let fx: Awaited<ReturnType<typeof buildFixture>>;
  before(async () => {
    fx = await buildFixture();
  });
  after(() => fx.cleanup());

  it("writes addresses + hashes into the manifest", async () => {
    const report = await populate({
      envs: ["ethereal-testnet"],
      protocolRoot: fx.protocolRoot,
      manifestDir: fx.manifestDir,
    });
    assert.equal(report.length, 2);
    const foo = report.find((r) => r.unit === "Foo")!;
    assert.equal(foo.address, "0xaa00");
    assert.match(foo.bytecodeHash ?? "", /^0x[0-9a-f]{64}$/);

    // Verify the written manifest reflects state.
    const written = JSON.parse(
      await readFile(join(fx.manifestDir, "ethereal-testnet.json"), "utf8"),
    );
    assert.equal(written.units.Foo.state.address, "0xaa00");
    assert.match(
      written.units.Foo.state.bytecodeHash,
      /^0x[0-9a-f]{64}$/,
    );
    assert.ok(written.meta.lastPopulatedAt);
  });

  it("does not write files in dry-run mode", async () => {
    // Reset manifest to known state
    const path = join(fx.manifestDir, "ethereal-testnet.json");
    const before = await readFile(path, "utf8");

    await populate({
      envs: ["ethereal-testnet"],
      protocolRoot: fx.protocolRoot,
      manifestDir: fx.manifestDir,
      dryRun: true,
    });

    const after = await readFile(path, "utf8");
    assert.equal(after, before);
  });

  it("preserves prior gitSha/txHash/deployedAt when re-populating", async () => {
    const path = join(fx.manifestDir, "ethereal-testnet.json");
    const m = JSON.parse(await readFile(path, "utf8"));
    m.units.Foo.state = {
      address: "0xaa00",
      gitSha: "abc123",
      txHash: "0xtx",
      deployedAt: "2026-05-13T00:00:00Z",
    };
    await writeFile(path, JSON.stringify(m, null, 2));

    await populate({
      envs: ["ethereal-testnet"],
      protocolRoot: fx.protocolRoot,
      manifestDir: fx.manifestDir,
    });

    const written = JSON.parse(await readFile(path, "utf8"));
    assert.equal(written.units.Foo.state.gitSha, "abc123");
    assert.equal(written.units.Foo.state.txHash, "0xtx");
    assert.equal(written.units.Foo.state.deployedAt, "2026-05-13T00:00:00Z");
    // address + hash still updated:
    assert.equal(written.units.Foo.state.address, "0xaa00");
    assert.match(
      written.units.Foo.state.bytecodeHash,
      /^0x[0-9a-f]{64}$/,
    );
  });

  it("falls back to SDK addresses when config.json has no entry", async () => {
    // Reset the manifest: Foo's produces key isn't in config.json (it is,
    // actually — buildFixture wires FOO_ADDRESS); use Bar but strip it from
    // config.json, then verify the SDK fallback fires.
    const path = join(fx.manifestDir, "ethereal-testnet.json");
    const m = JSON.parse(await readFile(path, "utf8"));
    m.units.Bar.sdkExport = "barFromSdk";
    delete m.units.Bar.state;
    await writeFile(path, JSON.stringify(m, null, 2));

    // Strip BAR_ADDRESS from the testnet config so config.json can't satisfy it.
    const cfgPath = join(
      fx.protocolRoot,
      "deployment",
      "testnet",
      "config.json",
    );
    const cfg = JSON.parse(await readFile(cfgPath, "utf8"));
    delete cfg.BAR_ADDRESS;
    await writeFile(cfgPath, JSON.stringify(cfg));

    await populate({
      envs: ["ethereal-testnet"],
      protocolRoot: fx.protocolRoot,
      manifestDir: fx.manifestDir,
      // ethereal-testnet fixture uses chainId 13374202.
      sdkAddresses: { barFromSdk: { 13374202: { address: "0xfrom-sdk" } } },
    });

    const written = JSON.parse(await readFile(path, "utf8"));
    assert.equal(written.units.Bar.state.address, "0xfrom-sdk");
  });

  it("prefers config.json over SDK when both have an address", async () => {
    // Restore BAR_ADDRESS in config.json then verify config wins.
    const cfgPath = join(
      fx.protocolRoot,
      "deployment",
      "testnet",
      "config.json",
    );
    await writeFile(
      cfgPath,
      JSON.stringify({ FOO_ADDRESS: "0xaa00", BAR_ADDRESS: "0xbb00" }),
    );

    const path = join(fx.manifestDir, "ethereal-testnet.json");
    const m = JSON.parse(await readFile(path, "utf8"));
    m.units.Bar.sdkExport = "barFromSdk";
    delete m.units.Bar.state;
    await writeFile(path, JSON.stringify(m, null, 2));

    await populate({
      envs: ["ethereal-testnet"],
      protocolRoot: fx.protocolRoot,
      manifestDir: fx.manifestDir,
      sdkAddresses: { barFromSdk: { 13374202: { address: "0xfrom-sdk" } } },
    });

    const written = JSON.parse(await readFile(path, "utf8"));
    assert.equal(written.units.Bar.state.address, "0xbb00");
  });

  it("records on-chain bytecode hash from the injected fetcher", async () => {
    // Restore both addresses in config.json (previous test stripped BAR_ADDRESS).
    const cfgPath = join(
      fx.protocolRoot,
      "deployment",
      "testnet",
      "config.json",
    );
    await writeFile(
      cfgPath,
      JSON.stringify({ FOO_ADDRESS: "0xaa00", BAR_ADDRESS: "0xbb00" }),
    );

    const calls: Array<{ env: string; address: string }> = [];
    const report = await populate({
      envs: ["ethereal-testnet"],
      protocolRoot: fx.protocolRoot,
      manifestDir: fx.manifestDir,
      fetchOnchainCode: async (env, address) => {
        calls.push({ env, address });
        if (address === "0xaa00") return "0xfeedface"; // matches Foo's artifact deployedBytecode
        if (address === "0xbb00") return "0xdeadc0de"; // drifts from Bar's "0x5678"
        return undefined;
      },
    });

    const foo = report.find((r) => r.unit === "Foo")!;
    const bar = report.find((r) => r.unit === "Bar")!;
    assert.equal(foo.onchainDrift, false, "Foo on-chain matches artifact");
    assert.equal(bar.onchainDrift, true, "Bar drifts");
    assert.match(foo.onchainBytecodeHash ?? "", /^0x[0-9a-f]{64}$/);
    assert.equal(calls.length, 2);

    const written = JSON.parse(
      await readFile(join(fx.manifestDir, "ethereal-testnet.json"), "utf8"),
    );
    assert.match(
      written.units.Foo.state.onchainBytecodeHash,
      /^0x[0-9a-f]{64}$/,
    );
  });

  it("skips the on-chain fetch entirely when --skip-onchain is set", async () => {
    const calls: number[] = [];
    await populate({
      envs: ["ethereal-testnet"],
      protocolRoot: fx.protocolRoot,
      manifestDir: fx.manifestDir,
      skipOnchain: true,
      fetchOnchainCode: async () => {
        calls.push(1);
        return "0xfeedface";
      },
    });
    assert.equal(calls.length, 0, "fetchOnchainCode must not be called");
  });

  it("leaves prev.onchainBytecodeHash intact when the fetcher returns undefined", async () => {
    const path = join(fx.manifestDir, "ethereal-testnet.json");
    const m = JSON.parse(await readFile(path, "utf8"));
    m.units.Foo.state = {
      address: "0xaa00",
      onchainBytecodeHash: "0xprev_value",
    };
    await writeFile(path, JSON.stringify(m, null, 2));

    await populate({
      envs: ["ethereal-testnet"],
      protocolRoot: fx.protocolRoot,
      manifestDir: fx.manifestDir,
      fetchOnchainCode: async () => undefined, // RPC unreachable
    });

    const written = JSON.parse(await readFile(path, "utf8"));
    assert.equal(written.units.Foo.state.onchainBytecodeHash, "0xprev_value");
  });
});
