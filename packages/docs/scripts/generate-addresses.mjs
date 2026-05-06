#!/usr/bin/env node
// Regenerate the contracts-and-addresses page from the SDK's built address map.
// Source of truth: packages/sdk/contracts/addresses.ts. Requires the SDK to be
// built (its dist/ directory) before this script runs.
//
// Usage:
//   node scripts/generate-addresses.mjs           # write the page
//   node scripts/generate-addresses.mjs --check   # exit 1 if the on-disk page
//                                                   differs from generated output

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sdkDist = resolve(__dirname, '../../sdk/dist/contracts/addresses.mjs');

if (!existsSync(sdkDist)) {
  console.error(
    `[generate-addresses] SDK dist not found at ${sdkDist}.\n` +
      `Run "pnpm --filter @sapience/sdk run build:lib" first.`
  );
  process.exit(2);
}

const sdk = await import(sdkDist);
const { contracts, collateralToken, eas, normalizeLegacyEntry } = sdk;

const PAGE_PATH = resolve(
  __dirname,
  '../docs/pages/builder-guide/reference/contracts-and-addresses.mdx'
);

const SCRIPT_REL_PATH = 'packages/docs/scripts/generate-addresses.mjs';

// Chain metadata: explorer URLs + display name. Add new chains here.
const CHAINS = {
  5064014: {
    name: 'Ethereal',
    explorer: 'https://explorer.ethereal.trade/address/',
    isTestnet: false,
  },
  13374202: {
    name: 'Ethereal Testnet',
    explorer: 'https://testnet-explorer.ethereal.trade/address/',
    isTestnet: true,
  },
  42161: {
    name: 'Arbitrum',
    explorer: 'https://arbiscan.io/address/',
    isTestnet: false,
  },
  421614: {
    name: 'Arbitrum Sepolia Testnet',
    explorer: 'https://sepolia.arbiscan.io/address/',
    isTestnet: true,
  },
  137: {
    name: 'Polygon',
    explorer: 'https://polygonscan.com/address/',
    isTestnet: false,
  },
};

// Group contracts by section per chain. The order here is the page order.
const SECTIONS = {
  Core: [
    {
      name: 'PredictionMarketEscrow',
      sdkKey: 'contracts.predictionMarketEscrow',
      map: contracts.predictionMarketEscrow,
    },
    {
      name: 'PredictionMarketVault',
      sdkKey: 'contracts.predictionMarketVault',
      map: contracts.predictionMarketVault,
    },
    {
      name: 'PythPredictionMarketVault',
      sdkKey: 'contracts.pythPredictionMarketVault',
      map: contracts.pythPredictionMarketVault,
    },
    {
      name: 'SingleLegVault',
      sdkKey: 'contracts.singleLegVault',
      map: contracts.singleLegVault,
    },
    {
      name: 'PredictionMarketVaultStrategyB',
      sdkKey: 'contracts.predictionMarketVaultStrategyB',
      map: contracts.predictionMarketVaultStrategyB,
    },
    {
      name: 'SecondaryMarketEscrow',
      sdkKey: 'contracts.secondaryMarketEscrow',
      map: contracts.secondaryMarketEscrow,
    },
    {
      name: 'OnboardingSponsor',
      sdkKey: 'contracts.onboardingSponsor',
      map: contracts.onboardingSponsor,
    },
    {
      name: 'Collateral (wUSDe)',
      sdkKey: 'collateralToken',
      map: collateralToken,
    },
  ],
  Resolvers: [
    {
      name: 'PythConditionResolver',
      sdkKey: 'contracts.pythConditionResolver',
      map: contracts.pythConditionResolver,
    },
    {
      name: 'ConditionalTokensConditionResolver',
      sdkKey: 'contracts.conditionalTokensConditionResolver',
      map: contracts.conditionalTokensConditionResolver,
    },
    {
      name: 'ManualConditionResolver',
      sdkKey: 'contracts.manualConditionResolver',
      map: contracts.manualConditionResolver,
    },
  ],
  Bridge: [
    {
      name: 'PredictionMarketBridge',
      sdkKey: 'contracts.predictionMarketBridge',
      map: contracts.predictionMarketBridge,
    },
    {
      name: 'PredictionMarketBridgeRemote',
      sdkKey: 'contracts.predictionMarketBridgeRemote',
      map: contracts.predictionMarketBridgeRemote,
    },
    {
      name: 'PredictionMarketTokenFactory',
      sdkKey: 'contracts.predictionMarketTokenFactory',
      map: contracts.predictionMarketTokenFactory,
    },
    {
      name: 'ConditionalTokensReader',
      sdkKey: 'contracts.conditionalTokensReader',
      map: contracts.conditionalTokensReader,
    },
    { name: 'EAS', sdkKey: 'eas', map: eas },
  ],
};

const explorerLink = (chainId, address) => {
  const meta = CHAINS[chainId];
  if (!meta) return `\`${address}\``;
  return `[\`${address}\`](${meta.explorer}${address})`;
};

// Render a markdown table for the entries that exist on a given chain in this
// section. Returns null if no entries exist.
const renderTable = (chainId, section) => {
  const rows = SECTIONS[section]
    .filter((c) => c.map[chainId])
    .map((c) => {
      const entry = c.map[chainId];
      return `| ${c.name} | ${explorerLink(chainId, entry.address)} | \`${c.sdkKey}\` |`;
    });
  if (rows.length === 0) return null;
  return [
    '| Contract | Address | SDK key |',
    '| -------- | ------- | ------- |',
    ...rows,
  ].join('\n');
};

const renderLegacyTable = (chainId) => {
  const allMaps = [
    ...SECTIONS.Core,
    ...SECTIONS.Resolvers,
    ...SECTIONS.Bridge,
  ];
  const rows = [];
  for (const c of allMaps) {
    const entry = c.map[chainId];
    if (!entry?.legacy?.length) continue;
    for (const leg of entry.legacy) {
      const norm = normalizeLegacyEntry(leg);
      rows.push(
        `| ${c.name} | ${explorerLink(chainId, norm.address)} | ${norm.blockCreated || '—'} |`
      );
    }
  }
  if (rows.length === 0) return null;
  return [
    '| Contract | Legacy address | Created at block |',
    '| -------- | -------------- | ---------------- |',
    ...rows,
  ].join('\n');
};

const renderChainSection = (chainId) => {
  const meta = CHAINS[chainId];
  const blocks = [`## ${meta.name}`];
  for (const section of Object.keys(SECTIONS)) {
    const table = renderTable(chainId, section);
    if (table) {
      blocks.push(`### ${section}\n\n${table}`);
    }
  }
  const legacy = renderLegacyTable(chainId);
  if (legacy) {
    blocks.push(
      `### Legacy deployments\n\nReplaced by the addresses above. ` +
        `Indexers and historical readers may still need these.\n\n${legacy}`
    );
  }
  return blocks.join('\n\n');
};

const chainsInOrder = [5064014, 13374202, 42161, 421614, 137].filter((id) =>
  Object.values(SECTIONS)
    .flat()
    .some((c) => c.map[id])
);

const supportedChainsTable = [
  '| Chain | ID | Usage |',
  '| ----- | -- | ----- |',
  ...chainsInOrder.map((id) => {
    const meta = CHAINS[id];
    return `| ${meta.name} | \`${id}\` | ${meta.isTestnet ? 'Testnet' : 'Mainnet'} |`;
  }),
].join('\n');

const body = [
  '---',
  "title: 'Contracts & Addresses'",
  "description: 'Deployed contract addresses and supported chains.'",
  '---',
  '',
  `{/* AUTOGENERATED — do not edit. Regenerate with \`pnpm --filter docs run generate:addresses\`. Source: ${SCRIPT_REL_PATH}. */}`,
  '',
  '# Contracts & Addresses',
  '',
  'All deployed addresses and ABIs are available in the SDK. Read from the SDK rather than copying addresses out of this page — `@sapience/sdk` is the source of truth and updates with each redeployment.',
  '',
  '```bash',
  'npm install @sapience/sdk',
  '```',
  '',
  '```typescript',
  "import { contracts } from '@sapience/sdk/contracts';",
  '',
  'const escrow = contracts.predictionMarketEscrow[5064014].address;',
  'const vault = contracts.predictionMarketVault[5064014].address;',
  '```',
  '',
  ':::note',
  'This page is generated from [`packages/sdk/contracts/addresses.ts`](https://github.com/sapiencexyz/sapience/blob/main/packages/sdk/contracts/addresses.ts) — that file is the source of truth, this page is a snapshot.',
  ':::',
  '',
  '## Supported Chains',
  '',
  supportedChainsTable,
  '',
  ...chainsInOrder.map(renderChainSection),
  '',
].join('\n');

const args = process.argv.slice(2);
if (args.includes('--check')) {
  let onDisk = '';
  try {
    onDisk = await readFile(PAGE_PATH, 'utf8');
  } catch {
    onDisk = '';
  }
  if (onDisk !== body) {
    console.error(
      `[generate-addresses] Drift detected in ${PAGE_PATH}.\n` +
        `Run "pnpm --filter docs run generate:addresses" and commit the result.`
    );
    process.exit(1);
  }
  console.log('[generate-addresses] No drift.');
  process.exit(0);
}

await writeFile(PAGE_PATH, body, 'utf8');
console.log(`[generate-addresses] Wrote ${PAGE_PATH}`);
