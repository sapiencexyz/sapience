import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { captureSpawn } from "../_shared/spawn.ts";
import {
  loadBundleEnv,
  loadConfigJson,
  loadEnvFile,
  parseEnvFile,
  writeConfigKey,
} from "../_shared/env.ts";

// ---------- captureSpawn ----------

describe("captureSpawn", () => {
  it("captures stdout from a successful command", async () => {
    const res = await captureSpawn("printf", ["hello"], "/tmp");
    assert.equal(res.exitCode, 0);
    assert.equal(res.stdout, "hello");
  });

  it("returns exit code 127 for missing commands", async () => {
    const res = await captureSpawn(
      "definitely-not-a-real-command",
      [],
      "/tmp",
    );
    assert.equal(res.exitCode, 127);
    assert.match(res.stderr, /(ENOENT|not.*found)/i);
  });

  it("returns non-zero exit code from failing commands without throwing", async () => {
    const res = await captureSpawn("false", [], "/tmp");
    assert.notEqual(res.exitCode, 0);
  });
});

// ---------- parseEnvFile ----------

describe("parseEnvFile", () => {
  it("parses KEY=VALUE lines", () => {
    const parsed = parseEnvFile("FOO=bar\nBAZ=qux\n");
    assert.deepEqual(parsed, { FOO: "bar", BAZ: "qux" });
  });

  it("strips surrounding double + single quotes", () => {
    const parsed = parseEnvFile(`FOO="bar baz"\nQ='hello'\n`);
    assert.equal(parsed.FOO, "bar baz");
    assert.equal(parsed.Q, "hello");
  });

  it("ignores blank lines and # comments", () => {
    const raw = `
# top comment
KEY=value

# inline-ish comment
ANOTHER=thing
`;
    assert.deepEqual(parseEnvFile(raw), { KEY: "value", ANOTHER: "thing" });
  });

  it("trims whitespace around keys and values", () => {
    assert.deepEqual(parseEnvFile("  PADDED   =   yes   \n"), { PADDED: "yes" });
  });

  it("skips lines with no `=`", () => {
    assert.deepEqual(parseEnvFile("nothere\nFOO=bar\n"), { FOO: "bar" });
  });
});

// ---------- env file IO ----------

describe("loadConfigJson / loadEnvFile / loadBundleEnv / writeConfigKey", () => {
  let root: string;
  before(async () => {
    root = mkdtempSync(join(tmpdir(), "shared-env-"));
    await mkdir(join(root, "deployment", "testnet"), { recursive: true });
    await writeFile(
      join(root, "deployment", "testnet", "config.json"),
      JSON.stringify({ A: "1", B: 42 }),
    );
    await writeFile(
      join(root, "deployment", "testnet", ".env"),
      "SECRET=shhh\nOVERRIDE_A=fromEnv\n",
    );
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  it("loadConfigJson returns the parsed object", () => {
    assert.deepEqual(loadConfigJson(root, "testnet"), { A: "1", B: 42 });
  });

  it("loadConfigJson returns {} when config.json is missing", () => {
    assert.deepEqual(loadConfigJson(root, "mainnet"), {});
  });

  it("loadEnvFile parses the .env file", async () => {
    assert.deepEqual(await loadEnvFile(root, "testnet"), {
      SECRET: "shhh",
      OVERRIDE_A: "fromEnv",
    });
  });

  it("loadBundleEnv merges .env then config.json then process.env", async () => {
    const prev = process.env.A;
    process.env.A = "fromProcessEnv"; // overrides config.json's A
    try {
      const merged = await loadBundleEnv(root, "testnet");
      // From .env
      assert.equal(merged.SECRET, "shhh");
      // .env's OVERRIDE_A preserved (config doesn't override it)
      assert.equal(merged.OVERRIDE_A, "fromEnv");
      // process.env wins over config.json
      assert.equal(merged.A, "fromProcessEnv");
      // config.json numeric values coerced to string
      assert.equal(merged.B, "42");
    } finally {
      if (prev === undefined) delete process.env.A;
      else process.env.A = prev;
    }
  });

  it("writeConfigKey persists a single key atomically", async () => {
    await writeConfigKey(root, "testnet", "NEW_KEY", "0xdeadbeef");
    const after = JSON.parse(
      await readFile(
        join(root, "deployment", "testnet", "config.json"),
        "utf8",
      ),
    );
    assert.equal(after.NEW_KEY, "0xdeadbeef");
    // Pre-existing keys preserved.
    assert.equal(after.A, "1");
    assert.equal(after.B, 42);
  });
});
