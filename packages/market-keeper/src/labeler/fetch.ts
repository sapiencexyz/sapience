#!/usr/bin/env node
/// <reference types="node" />
/**
 * Build the labeling corpus by pulling markets from Polymarket Gamma:
 *   - top 1000 by lifetime volume
 *   - latest 200 per Polymarket tag/category
 *
 * Output: packages/market-keeper/src/labeler/data/corpus.json
 *
 * Usage:
 *   pnpm --filter @sapience/market-keeper labeler:fetch
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

import { fetchCorpus } from './fetch-corpus';

async function main(): Promise<void> {
  const corpus = await fetchCorpus();
  const dataDir = path.join(__dirname, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const outPath = path.join(dataDir, 'corpus.json');
  fs.writeFileSync(outPath, JSON.stringify(corpus, null, 2));
  console.log(`[labeler-fetch] wrote ${corpus.length} markets → ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
