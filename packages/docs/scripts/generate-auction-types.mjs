#!/usr/bin/env node
// Regenerate the auction-protocol types partial used by auction-relayer.mdx.
// Source: packages/sdk/dist/types/{escrow,secondary}.d.ts. Requires the SDK to
// be built before this script runs.
//
// Usage:
//   node scripts/generate-auction-types.mjs           # write the partial
//   node scripts/generate-auction-types.mjs --check   # exit 1 on drift

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import prettier from 'prettier';

const __dirname = dirname(fileURLToPath(import.meta.url));

const formatMdx = (input) =>
  prettier.format(input, {
    parser: 'mdx',
    singleQuote: true,
  });

const SOURCES = {
  escrow: resolve(__dirname, '../../sdk/dist/types/escrow.d.ts'),
  secondary: resolve(__dirname, '../../sdk/dist/types/secondary.d.ts'),
};

const OUT_PATH = resolve(
  __dirname,
  '../docs/pages/builder-guide/api/_auction-types.mdx'
);

const SCRIPT_REL_PATH = 'packages/docs/scripts/generate-auction-types.mjs';

for (const [k, p] of Object.entries(SOURCES)) {
  if (!existsSync(p)) {
    console.error(
      `[generate-auction-types] ${k} types not found at ${p}.\n` +
        `Run "pnpm --filter @sapience/sdk run build:lib" first.`
    );
    process.exit(2);
  }
}

// Read interface block + its preceding JSDoc comment. Interfaces in .d.ts
// look like:
//   /** comment */
//   interface NAME {
//     field: type;
//   }
// Brace counting handles nested object types in fields.
const extractInterface = (src, name) => {
  const reInterfaceStart = new RegExp(`^interface ${name} \\{`, 'm');
  const startMatch = src.match(reInterfaceStart);
  if (!startMatch) {
    throw new Error(`Could not find interface ${name}`);
  }
  const startIdx = startMatch.index;

  // Walk backwards to capture the JSDoc comment immediately above (if any).
  let commentStart = startIdx;
  const before = src.slice(0, startIdx);
  const trimmed = before.replace(/\s+$/, '');
  if (trimmed.endsWith('*/')) {
    const commentOpen = trimmed.lastIndexOf('/**');
    if (commentOpen !== -1) {
      commentStart = commentOpen;
    }
  }

  // Walk forward, brace-counting, to find the matching closing brace.
  let depth = 0;
  let end = -1;
  for (let i = startIdx; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) {
    throw new Error(`Could not find closing brace for interface ${name}`);
  }

  return src.slice(commentStart, end).trim();
};

const extractTypeAlias = (src, name) => {
  // type NAME = ...; — capture up to terminating semicolon at brace depth 0.
  const reStart = new RegExp(`^type ${name} =`, 'm');
  const startMatch = src.match(reStart);
  if (!startMatch) {
    throw new Error(`Could not find type ${name}`);
  }
  const startIdx = startMatch.index;
  let depth = 0;
  let end = -1;
  for (let i = startIdx; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    else if (src[i] === ';' && depth === 0) {
      end = i + 1;
      break;
    }
  }
  if (end === -1) {
    throw new Error(`Could not find terminating semicolon for type ${name}`);
  }

  let commentStart = startIdx;
  const before = src.slice(0, startIdx);
  const trimmed = before.replace(/\s+$/, '');
  if (trimmed.endsWith('*/')) {
    const commentOpen = trimmed.lastIndexOf('/**');
    if (commentOpen !== -1) commentStart = commentOpen;
  }

  return src.slice(commentStart, end).trim();
};

const escrowSrc = await readFile(SOURCES.escrow, 'utf8');
const secondarySrc = await readFile(SOURCES.secondary, 'utf8');

// Interfaces grouped for the page. The page renders them in this order.
const ESCROW_INTERFACES = [
  'AuctionRFQPayload',
  'BidPayload',
  'AuctionDetails',
  'ValidatedBid',
  'IdentifyPayload',
  'AuctionReceivedPayload',
];
const ESCROW_TYPES = ['ClientToServerMessage', 'ServerToClientMessage'];
const SECONDARY_INTERFACES = [
  'SecondaryAuctionRequestPayload',
  'SecondaryBidPayload',
  'SecondaryAuctionDetails',
  'SecondaryValidatedBid',
  'SecondaryListingSummary',
];
const SECONDARY_TYPES = [
  'SecondaryClientToServerMessage',
  'SecondaryServerToClientMessage',
];

const renderBlock = (header, name, src, kind) => {
  const block =
    kind === 'interface'
      ? extractInterface(src, name)
      : extractTypeAlias(src, name);
  return `${header}\n\n\`\`\`ts\n${block}\n\`\`\``;
};

const sections = [];

sections.push('## Escrow auction types\n');
sections.push(
  'The primary auction protocol — predictor RFQ, vault/counterparty bid, on-chain mint. Terminology: `predictor` initiates the request; `counterparty` (typically a vault bot) fills it.\n'
);
for (const name of ESCROW_INTERFACES) {
  sections.push(renderBlock(`### ${name}`, name, escrowSrc, 'interface'));
}
for (const name of ESCROW_TYPES) {
  sections.push(renderBlock(`### ${name}`, name, escrowSrc, 'type'));
}

sections.push('\n## Secondary market types\n');
sections.push(
  'Atomic OTC swap of position tokens after mint. Terminology: `seller` lists tokens; `buyer` bids collateral.\n'
);
for (const name of SECONDARY_INTERFACES) {
  sections.push(renderBlock(`### ${name}`, name, secondarySrc, 'interface'));
}
for (const name of SECONDARY_TYPES) {
  sections.push(renderBlock(`### ${name}`, name, secondarySrc, 'type'));
}

const rawBody = [
  `{/* AUTOGENERATED — do not edit. Regenerate with \`pnpm --filter docs run generate:auction-types\`. Source: ${SCRIPT_REL_PATH}. */}`,
  '',
  ...sections,
  '',
].join('\n');
const body = await formatMdx(rawBody);

const args = process.argv.slice(2);
if (args.includes('--check')) {
  let onDisk = '';
  try {
    onDisk = await readFile(OUT_PATH, 'utf8');
  } catch {
    onDisk = '';
  }
  if (onDisk !== body) {
    console.error(
      `[generate-auction-types] Drift detected in ${OUT_PATH}.\n` +
        `Run "pnpm --filter docs run generate:auction-types" and commit the result.`
    );
    process.exit(1);
  }
  console.log('[generate-auction-types] No drift.');
  process.exit(0);
}

await writeFile(OUT_PATH, body, 'utf8');
console.log(`[generate-auction-types] Wrote ${OUT_PATH}`);
