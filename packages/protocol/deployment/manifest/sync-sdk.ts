// sync-sdk.ts — regenerate packages/sdk/contracts/addresses.ts from manifests.
//
// For each unit with `sdkExport`, the unit's chainId + state.address +
// state.blockCreated + state.legacy[] are written into the matching SDK
// `ChainAddressMap` export. Exports the manifests don't claim (e.g. `eas`,
// which is an external contract we don't deploy) are left untouched.
//
// Rotation semantics live in apply.ts: when a redeploy changes state.address
// the prior {address, blockCreated, deployedAt, gitSha, txHash} is pushed to
// state.legacy[0]. The SDK file mirrors that array verbatim, so the SDK's
// `legacy` history is the same shape consumers always saw.

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadAllManifests } from "./plan.ts";
import type {
  EnvName,
  LegacyDeployEntry,
  Manifest,
} from "./schema.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROTOCOL_ROOT = resolve(HERE, "..", "..");
const MANIFEST_DIR = resolve(HERE, "env");
const DEFAULT_SDK_FILE = resolve(
  PROTOCOL_ROOT,
  "..",
  "sdk",
  "contracts",
  "addresses.ts",
);

// ---------- types ----------

interface ChainEntry {
  address: string;
  blockCreated?: number;
  legacy: LegacyDeployEntry[];
}

/** One emitted SDK export: chainId -> ChainEntry. */
export type EmittedExport = Map<number, ChainEntry>;

export interface GenerateResult {
  /** The new addresses.ts source string. */
  source: string;
  /** Names that were regenerated (manifests claim them via `sdkExport`). */
  ownedExports: string[];
  /** Per-export grouped data, for inspection / tests. */
  perExport: Record<string, EmittedExport>;
  /** Exports the manifests claim but that don't exist in the SDK source. */
  missingExports: string[];
}

// ---------- builder ----------

/**
 * Walk every loaded manifest and collect units that declare `sdkExport`.
 * Same export name across multiple manifests = multiple chainId entries on
 * the same SDK export, which is exactly what we want.
 *
 * Multi-output units (`unit.outputs` set) emit one entry per
 * `outputs[k].sdkExport`, pulling the per-key address from
 * `state.addresses[k]` and per-key legacy from `state.legacy[].addresses[k]`.
 */
export function buildExports(
  manifests: Partial<Record<EnvName, Manifest>>,
): Record<string, EmittedExport> {
  const out: Record<string, EmittedExport> = {};
  for (const m of Object.values(manifests)) {
    if (!m) continue;
    for (const unit of Object.values(m.units)) {
      const state = unit.state;
      if (!state) continue;

      // Single-output path — preserves the original behaviour for every unit
      // that doesn't declare `outputs`.
      if (unit.sdkExport && state.address) {
        const exp = (out[unit.sdkExport] ??= new Map());
        exp.set(m.chain.chainId, {
          address: state.address,
          blockCreated: state.blockCreated,
          legacy: state.legacy ?? [],
        });
      }

      // Multi-output path — fan out by produces key.
      if (unit.outputs) {
        for (const [producesKey, output] of Object.entries(unit.outputs)) {
          if (!output.sdkExport) continue;
          const addr =
            state.addresses?.[producesKey] ??
            (producesKey === unit.produces[0] ? state.address : undefined);
          if (!addr) continue;
          const legacy: LegacyDeployEntry[] = [];
          for (const entry of state.legacy ?? []) {
            const legacyAddr =
              entry.addresses?.[producesKey] ??
              (producesKey === unit.produces[0] ? entry.address : undefined);
            if (!legacyAddr) continue;
            legacy.push({
              address: legacyAddr,
              blockCreated: entry.blockCreated,
              deployedAt: entry.deployedAt,
              gitSha: entry.gitSha,
              txHash: entry.txHash,
              replacedAt: entry.replacedAt,
            });
          }
          const exp = (out[output.sdkExport] ??= new Map());
          exp.set(m.chain.chainId, {
            address: addr,
            blockCreated: state.blockCreated,
            legacy,
          });
        }
      }
    }
  }
  return out;
}

/** Emit a single `export const NAME: ChainAddressMap = { … } as const;` block. */
export function emitExportBlock(
  name: string,
  entries: EmittedExport,
): string {
  const ids = [...entries.keys()].sort((a, b) => a - b);
  let out = `export const ${name}: ChainAddressMap = {\n`;
  for (const id of ids) {
    const e = entries.get(id)!;
    out += `  ${id}: {\n`;
    out += `    address: '${e.address}',\n`;
    if (e.blockCreated !== undefined)
      out += `    blockCreated: ${e.blockCreated},\n`;
    if (e.legacy.length === 0) {
      out += `    legacy: [] as const,\n`;
    } else {
      out += `    legacy: [\n`;
      for (const l of e.legacy) {
        out += `      { address: '${l.address}'`;
        if (l.blockCreated !== undefined) out += `, blockCreated: ${l.blockCreated}`;
        out += " },\n";
      }
      out += `    ] as const,\n`;
    }
    out += `  },\n`;
  }
  out += `} as const;`;
  return out;
}

/**
 * Locate the `export const ${name}: ChainAddressMap = { … } as const;` block
 * in `source` and return the body string + block bounds. Brace-walks so
 * `legacy[]` inner objects don't trip up.
 */
function locateExportBlock(
  source: string,
  name: string,
):
  | { blockStart: number; bodyStart: number; bodyEnd: number; blockEnd: number }
  | undefined {
  const startRe = new RegExp(
    `export\\s+const\\s+${name}\\s*:\\s*ChainAddressMap\\s*=\\s*\\{`,
  );
  const startMatch = source.match(startRe);
  if (!startMatch || startMatch.index === undefined) return undefined;

  const blockStart = startMatch.index;
  const bodyStart = blockStart + startMatch[0].length;
  let i = bodyStart;
  let depth = 1;
  while (i < source.length && depth > 0) {
    const ch = source[i++];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
  }
  if (depth !== 0) return undefined;
  const bodyEnd = i - 1;
  const tail = source.slice(i).match(/^\s*as\s+const\s*;/);
  if (!tail) return undefined;
  return { blockStart, bodyStart, bodyEnd, blockEnd: i + tail[0].length };
}

/**
 * Parse the existing chain entries of an export block. Used to PRESERVE
 * chainIds that the manifests don't claim (e.g. wUSDe `collateralToken` on
 * mainnet — not deployed by us, but consumers need the address).
 */
export function parseExportBlock(
  source: string,
  name: string,
): EmittedExport | undefined {
  const loc = locateExportBlock(source, name);
  if (!loc) return undefined;
  const body = source.slice(loc.bodyStart, loc.bodyEnd);
  return parseChainEntries(body);
}

function parseChainEntries(body: string): EmittedExport {
  const entries: EmittedExport = new Map();
  const re = /(\d+)\s*:\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const chainId = Number(m[1]);
    const start = m.index + m[0].length;
    let i = start;
    let depth = 1;
    while (i < body.length && depth > 0) {
      const ch = body[i++];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    entries.set(chainId, parseChainBlock(body.slice(start, i - 1)));
  }
  return entries;
}

function parseChainBlock(inner: string): ChainEntry {
  const addr = inner.match(/address\s*:\s*['"]([^'"]+)['"]/);
  const block = inner.match(/blockCreated\s*:\s*(\d+)/);
  const legacy: LegacyDeployEntry[] = [];
  const lm = inner.match(/legacy\s*:\s*\[/);
  if (lm && lm.index !== undefined) {
    let i = lm.index + lm[0].length;
    let depth = 1;
    while (i < inner.length && depth > 0) {
      const ch = inner[i++];
      if (ch === "[") depth++;
      else if (ch === "]") depth--;
    }
    const legacyBody = inner.slice(lm.index + lm[0].length, i - 1);
    let j = 0;
    while (j < legacyBody.length) {
      // Object form `{ address: '...', blockCreated?: n }`.
      if (legacyBody[j] === "{") {
        const objStart = j + 1;
        let d = 1;
        j++;
        while (j < legacyBody.length && d > 0) {
          const ch = legacyBody[j++];
          if (ch === "{") d++;
          else if (ch === "}") d--;
        }
        const objBody = legacyBody.slice(objStart, j - 1);
        const a = objBody.match(/address\s*:\s*['"]([^'"]+)['"]/);
        const b = objBody.match(/blockCreated\s*:\s*(\d+)/);
        if (a) {
          const e: LegacyDeployEntry = { address: a[1] };
          if (b) e.blockCreated = Number(b[1]);
          legacy.push(e);
        }
      } else if (legacyBody[j] === "'" || legacyBody[j] === '"') {
        // Bare address-string form `'0x...'`.
        const quote = legacyBody[j];
        const end = legacyBody.indexOf(quote, j + 1);
        if (end < 0) break;
        legacy.push({ address: legacyBody.slice(j + 1, end) });
        j = end + 1;
      } else {
        j++;
      }
    }
  }
  return {
    address: addr ? addr[1] : "",
    blockCreated: block ? Number(block[1]) : undefined,
    legacy,
  };
}

/**
 * Merge manifest-derived chain entries with what's already in the SDK file.
 *
 * The manifest wins on conflicts (it's the source of truth for units we
 * actually deploy). Chain entries the manifests don't claim are PRESERVED
 * verbatim — this covers contracts the SDK tracks but we don't manage (e.g.
 * external wUSDe on mainnet under `collateralToken`).
 */
export function mergeWithExisting(
  manifestEntries: EmittedExport,
  existing: EmittedExport | undefined,
): EmittedExport {
  const out: EmittedExport = new Map();
  if (existing) {
    for (const [chainId, entry] of existing) out.set(chainId, entry);
  }
  for (const [chainId, entry] of manifestEntries) out.set(chainId, entry);
  return out;
}

/**
 * Replace the `export const ${name}: ChainAddressMap = { … } as const;` block
 * in `source` with `newBlock`. Returns `source` unchanged if the export is
 * missing.
 */
export function replaceExportBlock(
  source: string,
  name: string,
  newBlock: string,
): { source: string; replaced: boolean } {
  const loc = locateExportBlock(source, name);
  if (!loc) return { source, replaced: false };
  return {
    source: source.slice(0, loc.blockStart) + newBlock + source.slice(loc.blockEnd),
    replaced: true,
  };
}

export function generateSdkAddresses(
  manifests: Partial<Record<EnvName, Manifest>>,
  source: string,
): GenerateResult {
  const perExport = buildExports(manifests);
  const ownedExports: string[] = [];
  const missingExports: string[] = [];
  let current = source;
  for (const [name, manifestEntries] of Object.entries(perExport)) {
    const existing = parseExportBlock(current, name);
    if (!existing) {
      missingExports.push(name);
      continue;
    }
    const merged = mergeWithExisting(manifestEntries, existing);
    const block = emitExportBlock(name, merged);
    const { source: next, replaced } = replaceExportBlock(current, name, block);
    if (replaced) {
      current = next;
      ownedExports.push(name);
    }
  }
  return { source: current, ownedExports, perExport, missingExports };
}

// ---------- CLI ----------

interface CliOptions {
  sdkFile: string;
  dryRun: boolean;
  manifestDir: string;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    sdkFile: DEFAULT_SDK_FILE,
    dryRun: false,
    manifestDir: MANIFEST_DIR,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--sdk-file") opts.sdkFile = resolve(argv[++i] ?? "");
    else if (a === "--manifest-dir") opts.manifestDir = resolve(argv[++i] ?? "");
    else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else throw new Error(`Unknown argument: ${a}`);
  }
  return opts;
}

function printHelp(): void {
  console.log(`Usage: sync-sdk [options]

Regenerates packages/sdk/contracts/addresses.ts from the manifests. For each
unit with \`sdkExport\` set, writes the manifest's state.address /
state.blockCreated / state.legacy[] into the matching SDK export. Exports
not claimed by any manifest unit are left untouched.

Options:
  --sdk-file <path>     Override the target file (default:
                        packages/sdk/contracts/addresses.ts).
  --manifest-dir <p>    Override the manifest directory (for tests).
  --dry-run             Print the diff stats but don't write the file.
  -h, --help            Show this help.
`);
}

async function runCli(opts: CliOptions): Promise<void> {
  if (!existsSync(opts.sdkFile))
    throw new Error(`SDK file not found at ${opts.sdkFile}`);
  const manifests = await loadAllManifests(opts.manifestDir);
  const before = await readFile(opts.sdkFile, "utf8");
  const result = generateSdkAddresses(manifests, before);

  if (result.missingExports.length > 0) {
    console.warn(
      `[warn] manifest exports not found in SDK file (will be skipped): ${result.missingExports.join(", ")}`,
    );
  }

  if (result.source === before) {
    console.log("✓ SDK addresses.ts already in sync with manifests.");
    return;
  }

  const linesBefore = before.split("\n").length;
  const linesAfter = result.source.split("\n").length;
  console.log(
    `→ Regenerated ${result.ownedExports.length} export(s) (${linesBefore} -> ${linesAfter} lines).`,
  );
  for (const name of result.ownedExports) console.log(`    ${name}`);

  if (opts.dryRun) {
    console.log("(dry-run — not writing)");
    return;
  }
  await writeFile(opts.sdkFile, result.source, "utf8");
  console.log(`✓ Wrote ${opts.sdkFile}`);
}

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("sync-sdk.ts");

if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  runCli(opts).catch((err) => {
    console.error(err.stack ?? err.message ?? String(err));
    process.exit(1);
  });
}
