// _shared/env.ts — config.json / .env loading + writeback for a bundle.
//
// The three deploy CLIs (apply, verify, ops) all need the same merge order:
//   1. <bundle>/.env (secrets, .gitignored)
//   2. <bundle>/config.json (public, versioned)
//   3. process.env (operator overrides)
// matching the legacy deploy.sh behaviour. This module centralises that.

import { readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Bundle } from "../schema.ts";

export function configJsonPath(protocolRoot: string, bundle: Bundle): string {
  return resolve(protocolRoot, "deployment", bundle, "config.json");
}

export function envFilePath(protocolRoot: string, bundle: Bundle): string {
  return resolve(protocolRoot, "deployment", bundle, ".env");
}

export function loadConfigJson(
  protocolRoot: string,
  bundle: Bundle,
): Record<string, unknown> {
  const p = configJsonPath(protocolRoot, bundle);
  if (!existsSync(p)) return {};
  return JSON.parse(readFileSync(p, "utf8"));
}

/**
 * Parse a KEY=VALUE-per-line `.env` file. Tolerates surrounding quotes,
 * leading/trailing whitespace, blank lines, and `#` comments. Returns {}
 * when the file is missing — the operator's bundle may not have an .env
 * if they're running read-only commands.
 */
export async function loadEnvFile(
  protocolRoot: string,
  bundle: Bundle,
): Promise<Record<string, string>> {
  const p = envFilePath(protocolRoot, bundle);
  if (!existsSync(p)) return {};
  const raw = await readFile(p, "utf8");
  return parseEnvFile(raw);
}

/** Pure parser, exported so tests don't need a real file. */
export function parseEnvFile(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Merge .env + config.json + process.env (deploy.sh's loading order).
 * Useful for any one-shot CLI that just needs a fully-resolved env map.
 */
export async function loadBundleEnv(
  protocolRoot: string,
  bundle: Bundle,
): Promise<Record<string, string>> {
  const envFile = await loadEnvFile(protocolRoot, bundle);
  const cfg = loadConfigJson(protocolRoot, bundle);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(envFile)) out[k] = v;
  for (const [k, v] of Object.entries(cfg))
    if (typeof v === "string") out[k] = v;
    else if (typeof v === "number") out[k] = String(v);
  for (const [k, v] of Object.entries(process.env))
    if (typeof v === "string") out[k] = v;
  return out;
}

/** Atomic write of a single key into the bundle's config.json. */
export async function writeConfigKey(
  protocolRoot: string,
  bundle: Bundle,
  key: string,
  value: string,
): Promise<void> {
  const p = configJsonPath(protocolRoot, bundle);
  const cfg = loadConfigJson(protocolRoot, bundle);
  cfg[key] = value;
  await writeFile(p, JSON.stringify(cfg, null, 2) + "\n", "utf8");
}
