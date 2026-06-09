import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  extractAddress,
  extractBytes32,
  parseBridgeStatus,
  parseCliArgs,
  parseGetPendingBridgeOutput,
} from "../ops.ts";

// ---------- parseCliArgs ----------

describe("parseCliArgs", () => {
  it("picks the first non-flag arg as the subcommand", () => {
    const opts = parseCliArgs(["mint", "--bundle", "testnet"]);
    assert.equal(opts.subcommand, "mint");
    assert.equal(opts.bundle, "testnet");
  });

  it("captures --bundle independently of position", () => {
    const opts = parseCliArgs(["--bundle", "mainnet", "status"]);
    assert.equal(opts.subcommand, "status");
    assert.equal(opts.bundle, "mainnet");
  });

  it("rejects unknown --bundle values", () => {
    assert.throws(() => parseCliArgs(["mint", "--bundle", "staging"]),
      /must be "testnet" or "mainnet"/);
  });

  it("skips the pnpm '--' end-of-options sentinel", () => {
    const opts = parseCliArgs(["--", "mint", "--bundle", "testnet"]);
    assert.equal(opts.subcommand, "mint");
    assert.equal(opts.bundle, "testnet");
  });

  it("collects unknown args into rest", () => {
    const opts = parseCliArgs(["mint", "--bundle", "testnet", "--foo", "bar"]);
    assert.deepEqual(opts.rest, ["--foo", "bar"]);
  });
});

// ---------- extractAddress / extractBytes32 ----------

describe("extract helpers", () => {
  it("extractAddress matches '  KEY= 0x...' lines", () => {
    const out = "  PREDICTOR_TOKEN_ADDRESS= 0x1234567890123456789012345678901234567890\n";
    assert.equal(
      extractAddress(out, "PREDICTOR_TOKEN_ADDRESS"),
      "0x1234567890123456789012345678901234567890",
    );
  });

  it("extractBytes32 matches 32-byte hex IDs", () => {
    const out = "  BRIDGE_ID= 0x" + "ab".repeat(32) + "\n";
    assert.equal(extractBytes32(out, "BRIDGE_ID"), "0x" + "ab".repeat(32));
  });

  it("returns undefined when key is absent", () => {
    assert.equal(extractAddress("nothing", "FOO"), undefined);
    assert.equal(extractBytes32("nothing", "FOO"), undefined);
  });

  it("does not match partial-key collisions", () => {
    const out = "  PREDICTOR_TOKEN_ADDRESS= 0x" + "11".repeat(20) + "\n";
    assert.equal(
      extractAddress(out, "TOKEN_ADDRESS"),
      undefined,
      "TOKEN_ADDRESS should not match a longer key name",
    );
  });
});

// ---------- parseBridgeStatus ----------

describe("parseBridgeStatus", () => {
  it("maps known status codes", () => {
    assert.equal(parseBridgeStatus(0), "PENDING");
    assert.equal(parseBridgeStatus(1), "COMPLETED");
    assert.equal(parseBridgeStatus(2), "REFUNDED");
  });

  it("returns UNKNOWN(n) for anything else", () => {
    assert.equal(parseBridgeStatus(7), "UNKNOWN(7)");
    assert.equal(parseBridgeStatus("garbage"), "UNKNOWN(garbage)");
  });
});

// ---------- parseGetPendingBridgeOutput ----------

describe("parseGetPendingBridgeOutput", () => {
  it("pulls token + sender + recipient + amount + status from a cast tuple", () => {
    const raw =
      "(0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, 0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, 0xcccccccccccccccccccccccccccccccccccccccc, 1000000000000000000, 1747200000, 1747200300, 1)";
    const fields = parseGetPendingBridgeOutput(raw);
    assert.equal(fields.token, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    assert.equal(fields.sender, "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    assert.equal(fields.recipient, "0xcccccccccccccccccccccccccccccccccccccccc");
    assert.equal(fields.amount, "1000000000000000000");
    assert.equal(fields.status, "COMPLETED");
  });

  it("flags PENDING when status num is 0", () => {
    const raw =
      "(0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, 0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, 0xcccccccccccccccccccccccccccccccccccccccc, 1, 100, 200, 0)";
    assert.equal(parseGetPendingBridgeOutput(raw).status, "PENDING");
  });
});
