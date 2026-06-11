/**
 * Regenerates v1-operations.ts from the BUILT SDK, so the frozen copies are
 * verbatim by construction. Only needed if a v1 op legitimately changes —
 * which should not happen; v1 is frozen.
 *
 * Usage (from packages/api):
 *   pnpm --filter @sapience/sdk run build:lib
 *   node test/contract/fixtures/regenerate-v1-operations.mjs
 */
/* eslint-disable no-console -- CLI script; console IS the interface */

import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const q = require('@sapience/sdk/queries');

const OPS = [
  'GET_CONDITIONS',
  'CONDITIONS_BY_IDS_QUERY',
  'GET_CONDITION_GROUPS',
  'GET_CATEGORIES',
  'GET_QUESTIONS',
  'GET_PICK_CONFIGURATIONS',
  'GET_POPULAR_TAGS',
  'GET_PROTOCOL_STATS',
  'GET_OPEN_INTEREST_BY_CATEGORY',
  'GET_OPEN_INTEREST_BY_TIME_TO_RESOLUTION',
  'GET_PROFIT_LEADERBOARD',
  'GET_ACCURACY_LEADERBOARD',
  'GET_ACCOUNT_ACCURACY_RANK',
  'GET_ATTESTATIONS_QUERY',
  'GET_ATTESTATIONS_PAGINATED_QUERY',
];

const missing = OPS.filter((n) => typeof q[n] !== 'string');
if (missing.length) {
  console.error('Missing ops in @sapience/sdk/queries:', missing);
  process.exit(1);
}

const header = `/**
 * FROZEN copies of the v1 operation documents the contract suite pins.
 *
 * Why frozen: the live constants in @sapience/sdk/queries flip to v2
 * documents during the consumer migration (PR #1823). The v1 contract
 * tests (and the v1 side of every parity pair) must keep exercising the
 * EXACT v1 wire contract, so the op text is snapshotted here instead of
 * imported from the SDK. Do not edit by hand; regenerate with
 * \`node test/contract/fixtures/regenerate-v1-operations.mjs\` (see that
 * file for when this is appropriate — it should essentially never be).
 */

`;

const escape = (s) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
const body = OPS.map(
  (n) => `export const ${n} = /* GraphQL */ \`${escape(q[n])}\`;`
).join('\n\n');

writeFileSync(
  new URL('./v1-operations.ts', import.meta.url),
  header + body + '\n'
);
console.log(`wrote ${OPS.length} ops to v1-operations.ts`);
