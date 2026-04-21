#!/usr/bin/env node
// Inserts or replaces a chain entry inside a ChainAddressMap export in
// packages/sdk/contracts/addresses.ts. Generic helper — used by deploy.sh
// after any vault-style deploy (pythPredictionMarketVault, etc.).
//
// On replace, the previous {address, blockCreated} pair is prepended to the
// chain's `legacy` array (most recent first) — preserving any entries that
// were already there. The new entry's own `legacy` starts empty.
//
//   node update-sdk-vault.mjs --exportName <name> --chainId <id> --address 0x... [--blockCreated <n>] [--deployDate YYYY-MM-DD]
//
// The export must already exist in addresses.ts with at least the empty form:
//   export const <name>: ChainAddressMap = {
//     // (entries inserted by deploy)
//   } as const;

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
  if (arg.startsWith('--')) acc[arg.slice(2)] = arr[i + 1];
  return acc;
}, {});

const { exportName, chainId, address, blockCreated, deployDate } = args;
if (!exportName || !chainId || !address) {
  console.error(
    'Usage: update-sdk-vault.mjs --exportName <name> --chainId <id> --address 0x... [--blockCreated <n>] [--deployDate YYYY-MM-DD]',
  );
  process.exit(1);
}

if (deployDate && !/^\d{4}-\d{2}-\d{2}$/.test(deployDate)) {
  console.error(`Invalid --deployDate: ${deployDate} (expected YYYY-MM-DD)`);
  process.exit(1);
}

if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(exportName)) {
  console.error(`Invalid exportName: ${exportName}`);
  process.exit(1);
}

if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
  console.error(`Invalid address: ${address}`);
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sdkFile = path.resolve(
  __dirname,
  '../../../../sdk/contracts/addresses.ts',
);

if (!fs.existsSync(sdkFile)) {
  console.error(`SDK addresses file not found: ${sdkFile}`);
  process.exit(1);
}

const src = fs.readFileSync(sdkFile, 'utf8');

const escaped = exportName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const blockRe = new RegExp(
  `(export const ${escaped}: ChainAddressMap = \\{)([\\s\\S]*?)(\\n\\} as const;)`,
);
const match = src.match(blockRe);
if (!match) {
  console.error(
    `Could not find \`export const ${exportName}: ChainAddressMap = { ... } as const;\` in addresses.ts.`,
  );
  console.error('Bootstrap it first with an empty map, then rerun.');
  process.exit(1);
}

const [, prefix, body, suffix] = match;

const networkComment =
  chainId === '5064014'
    ? 'Ethereal mainnet'
    : chainId === '13374202'
      ? 'Ethereal testnet'
      : `chain ${chainId}`;
const today = deployDate ?? new Date().toISOString().slice(0, 10);

// Extract the existing chain entry (if any) and parse its current
// {address, blockCreated, legacyInner} so we can prepend them to legacy.
const existingEntryRe = new RegExp(
  `(^|\\n)  ${chainId}:\\s*\\{([\\s\\S]*?)\\n  \\},?`,
  'g',
);
const existingMatch = existingEntryRe.exec(body);

function parseExistingEntry(entryBody) {
  const addr = entryBody.match(/address:\s*'(0x[a-fA-F0-9]{40})'/);
  const block = entryBody.match(/blockCreated:\s*(\d+)/);
  const legacy = entryBody.match(/legacy:\s*\[([\s\S]*?)\]\s*as\s+const/);
  return {
    address: addr ? addr[1] : null,
    blockCreated: block ? Number.parseInt(block[1], 10) : null,
    legacyInner: legacy ? legacy[1] : null, // inner content between `[` and `]`
  };
}

// Compose a fresh `legacy: [ ... ] as const` trailer from the old entry +
// whatever legacy entries the old entry already had.
function buildLegacyClause(oldEntry) {
  if (!oldEntry || !oldEntry.address) return '    legacy: [] as const,\n';

  // If the old address matches what we're writing (CREATE2 redeploy to same
  // slot, for instance), don't add it to legacy.
  const addSame = oldEntry.address.toLowerCase() === address.toLowerCase();
  const parts = [];
  if (!addSame) {
    const blockLine =
      oldEntry.blockCreated != null
        ? `\n        blockCreated: ${oldEntry.blockCreated},`
        : '';
    parts.push(
      `      {\n        address: '${oldEntry.address}',${blockLine}\n      },`,
    );
  }

  // Preserve the old legacy entries verbatim (trimmed of leading/trailing
  // whitespace so we can re-lay them out with consistent surroundings).
  const oldLegacyInner = (oldEntry.legacyInner ?? '').trim();
  if (oldLegacyInner) parts.push(`      ${oldLegacyInner}`);

  if (parts.length === 0) return '    legacy: [] as const,\n';
  return `    legacy: [\n${parts.join('\n')}\n    ] as const,\n`;
}

const oldEntry = existingMatch ? parseExistingEntry(existingMatch[2]) : null;
const blockLine = blockCreated ? `    blockCreated: ${blockCreated},\n` : '';
const legacyClause = buildLegacyClause(oldEntry);

const newEntry =
  `  ${chainId}: {\n` +
  `    // ${networkComment} — deployed ${today}\n` +
  `    address: '${address}',\n` +
  blockLine +
  legacyClause +
  `  },`;

// Drop any "(entries inserted by …)" bootstrap placeholder and trailing
// whitespace so real entries aren't mixed with the placeholder comment.
let trimmed = body
  .replace(/^\s*\/\/ \(entries inserted by[^\n]*\n?/m, '')
  .replace(/\s+$/, '');

// Match an existing chain entry (2-space-indented `<id>: { ... },` block).
const chainEntryRe = new RegExp(
  `(^|\\n)  ${chainId}:\\s*\\{[\\s\\S]*?\\n  \\},?`,
  'g',
);

let newBody;
let action;
if (chainEntryRe.test(trimmed)) {
  chainEntryRe.lastIndex = 0;
  newBody = trimmed.replace(chainEntryRe, (_, lead) => `${lead}${newEntry}`);
  action = oldEntry && oldEntry.address && oldEntry.address.toLowerCase() !== address.toLowerCase()
    ? 'Replaced (old address moved to legacy)'
    : 'Replaced';
} else {
  newBody = trimmed.length === 0 ? `\n${newEntry}` : `${trimmed}\n${newEntry}`;
  action = 'Added';
}

const newSrc = src.replace(
  blockRe,
  `${prefix}${newBody}\n${suffix.replace(/^\n/, '')}`,
);
fs.writeFileSync(sdkFile, newSrc);

console.log(
  `${action} ${exportName}[${chainId}] = ${address} in ${path.relative(process.cwd(), sdkFile)}`,
);
