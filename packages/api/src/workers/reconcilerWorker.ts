/**
 * Reconciler Worker
 *
 * Periodically re-scans recent blocks across all active indexers to catch
 * any events the primary Background Worker may have missed (due to RPC
 * hiccups, restarts, race conditions, etc.).
 *
 * For each chain, it:
 * 1. Reads a watermark from the key_value_store (last reconciled block)
 * 2. Fetches logs from watermark+1 → current block
 * 3. Replays them through the same indexer indexBlocks pipeline
 * 4. Updates the watermark
 *
 * This is idempotent — re-processing an already-indexed event is a no-op
 * (upserts in the indexers handle deduplication).
 *
 * Start command: pnpm start:reconciler-worker
 * Env vars:
 *   RECONCILER_INTERVAL_SECONDS  — polling interval (default: 30)
 *   RECONCILER_LOOKBACK_BLOCKS   — fallback lookback if no watermark (default: 5000)
 */

import 'reflect-metadata';
import prisma from '../db';
import { initializeDataSource } from '../db';
import { initializeFixtures, INDEXERS } from '../fixtures';
import { createResilientProcess, getProviderForChain } from '../utils/utils';
import type { PublicClient } from 'viem';
import { IIndexer } from '../interfaces';

// ─── Config ──────────────────────────────────────────────────────────────────

const INTERVAL_SECONDS = Number(
  process.env.RECONCILER_INTERVAL_SECONDS || '30'
);
const FALLBACK_LOOKBACK = BigInt(
  process.env.RECONCILER_LOOKBACK_BLOCKS || '5000'
);
const BLOCK_BATCH_SIZE = 100;
const LOG_PREFIX = '[RECONCILER]';

// ─── KV helpers ──────────────────────────────────────────────────────────────

async function getWatermark(chainId: number): Promise<bigint | null> {
  const record = await prisma.keyValueStore.findUnique({
    where: { key: `reconciler:chain:${chainId}:lastBlock` },
  });
  if (!record?.value) return null;
  try {
    const n = BigInt(record.value);
    return n > 0n ? n : null;
  } catch {
    return null;
  }
}

async function setWatermark(chainId: number, block: bigint): Promise<void> {
  const key = `reconciler:chain:${chainId}:lastBlock`;
  await prisma.keyValueStore.upsert({
    where: { key },
    update: { value: block.toString() },
    create: { key, value: block.toString() },
  });
}

async function setStatus(status: string, description: string): Promise<void> {
  const key = 'reconciler:status';
  await prisma.keyValueStore.upsert({
    where: { key },
    update: {
      value: JSON.stringify({ status, description, timestamp: Date.now() }),
    },
    create: {
      key,
      value: JSON.stringify({ status, description, timestamp: Date.now() }),
    },
  });
}

// ─── Reconciler logic ────────────────────────────────────────────────────────

/**
 * Group indexers by chain ID using their PublicClient's chain property.
 */
function getIndexersByChain(): Map<
  number,
  { slug: string; indexer: IIndexer }[]
> {
  const byChain = new Map<number, { slug: string; indexer: IIndexer }[]>();

  for (const [slug, indexer] of Object.entries(INDEXERS)) {
    if (!indexer?.client) continue;

    // Skip EAS indexer — it runs on Arbitrum's public RPC which has
    // aggressive rate limits. The Background Worker handles EAS; the
    // reconciler focuses on Ethereal chain events.
    if (slug.startsWith('attestation-')) {
      console.log(`${LOG_PREFIX} Skipping ${slug} (EAS on Arbitrum — rate-limited)`);
      continue;
    }

    const chainId = (
      indexer.client as PublicClient & { chain?: { id: number } }
    ).chain?.id;
    if (!chainId) continue;

    if (!byChain.has(chainId)) byChain.set(chainId, []);
    byChain.get(chainId)!.push({ slug, indexer });
  }

  return byChain;
}

async function reconcileOnce(): Promise<void> {
  await setStatus('processing', 'Starting reconciliation pass');

  const indexersByChain = getIndexersByChain();

  if (indexersByChain.size === 0) {
    console.log(`${LOG_PREFIX} No indexers with chain clients found, skipping`);
    await setStatus('idle', 'No indexers configured');
    return;
  }

  let totalBlocksScanned = 0;
  let totalIndexerRuns = 0;

  for (const [chainId, indexers] of indexersByChain) {
    const client = getProviderForChain(chainId);
    let currentBlock: bigint;

    try {
      currentBlock = await client.getBlockNumber();
    } catch (err) {
      console.error(
        `${LOG_PREFIX} Chain ${chainId}: failed to get block number:`,
        err
      );
      continue;
    }

    // Determine start block from watermark or fallback
    const watermark = await getWatermark(chainId);
    let fromBlock: bigint;

    if (watermark) {
      fromBlock = watermark + 1n;
    } else {
      fromBlock =
        currentBlock > FALLBACK_LOOKBACK
          ? currentBlock - FALLBACK_LOOKBACK
          : 0n;
    }

    if (fromBlock > currentBlock) {
      console.log(
        `${LOG_PREFIX} Chain ${chainId}: up to date (watermark=${watermark}, head=${currentBlock})`
      );
      continue;
    }

    const range = currentBlock - fromBlock;
    console.log(
      `${LOG_PREFIX} Chain ${chainId}: scanning blocks ${fromBlock}→${currentBlock} (range=${range})`
    );

    try {
      // Process in batches
      for (
        let batchStart = Number(fromBlock);
        batchStart <= Number(currentBlock);
        batchStart += BLOCK_BATCH_SIZE
      ) {
        const batchEnd = Math.min(
          batchStart + BLOCK_BATCH_SIZE - 1,
          Number(currentBlock)
        );
        const blockNumbers = Array.from(
          { length: batchEnd - batchStart + 1 },
          (_, i) => batchStart + i
        );

        // Run each indexer over this batch
        for (const { slug, indexer } of indexers) {
          try {
            await indexer.indexBlocks(slug, blockNumbers);
            totalIndexerRuns++;
          } catch (err) {
            console.error(
              `${LOG_PREFIX} Chain ${chainId} indexer "${slug}": error on blocks ${batchStart}-${batchEnd}:`,
              err
            );
            // Continue — don't let one indexer failure stop others
          }
        }

        totalBlocksScanned += blockNumbers.length;
      }

      await setWatermark(chainId, currentBlock);
      console.log(
        `${LOG_PREFIX} Chain ${chainId}: watermark → ${currentBlock}`
      );
    } catch (err) {
      console.error(
        `${LOG_PREFIX} Chain ${chainId}: reconciliation failed:`,
        err
      );
    }
  }

  console.log(
    `${LOG_PREFIX} Pass complete: chains=${indexersByChain.size}, blocks=${totalBlocksScanned}, indexerRuns=${totalIndexerRuns}`
  );

  await prisma.keyValueStore.upsert({
    where: { key: 'reconciler:lastRunAt' },
    update: { value: new Date().toISOString() },
    create: { key: 'reconciler:lastRunAt', value: new Date().toISOString() },
  });

  await setStatus('idle', 'Reconciliation completed');
}

// ─── Main loop ───────────────────────────────────────────────────────────────

async function runReconcilerLoop(): Promise<void> {
  await initializeDataSource();
  await initializeFixtures();

  console.log(
    `${LOG_PREFIX} Starting reconciler (interval=${INTERVAL_SECONDS}s, fallbackLookback=${FALLBACK_LOOKBACK} blocks)`
  );

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await reconcileOnce();
    } catch (err) {
      console.error(`${LOG_PREFIX} Reconciliation pass failed:`, err);
    }

    await new Promise((resolve) =>
      setTimeout(resolve, INTERVAL_SECONDS * 1000)
    );
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

(async () => {
  await createResilientProcess(runReconcilerLoop, 'reconcilerWorker')();
})();
