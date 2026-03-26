import prisma from '../../db';
import { initializeDataSource } from '../../db';
import { getProviderForChain } from '../../utils/utils';
import { parseAbiItem } from 'viem';
import { collateralToken } from '@sapience/sdk/contracts';

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)'
);
const BLOCK_BATCH_SIZE = 500;
const INDEXER_STATE_KEY = 'collateral-transfer-indexer';
const TIMESTAMP_CHUNK_SIZE = 20;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function getLogsWithRetry(
  client: ReturnType<typeof getProviderForChain>,
  params: {
    address: `0x${string}`;
    event: typeof TRANSFER_EVENT;
    fromBlock: bigint;
    toBlock: bigint;
  }
) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const logs = await client.getLogs(params);
      return logs;
    } catch (error) {
      if (attempt === MAX_RETRIES) throw error;
      console.warn(
        `[reindexCollateralTransfers] getLogs failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${RETRY_DELAY_MS}ms...`,
        error instanceof Error ? error.message : error
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
    }
  }
  // Unreachable, but satisfies TypeScript
  throw new Error('getLogsWithRetry: exhausted retries');
}

/**
 * Reindex wUSDe collateral Transfer events.
 *
 * Resets the collateral transfer indexer cursor and replays all Transfer
 * events from `fromBlock` (or the token's blockCreated) to the current block.
 * Uses createMany with skipDuplicates so it's safe to re-process ranges that
 * were already indexed.
 *
 * Usage: tsx src/workers/worker.ts reindexCollateralTransfers <chainId> [fromBlock]
 */
export async function reindexCollateralTransfers(
  chainId: number,
  fromBlock?: number
): Promise<boolean> {
  await initializeDataSource();

  const entry = collateralToken[chainId];
  if (!entry?.address) {
    console.error(
      `[reindexCollateralTransfers] No collateral token address for chain ${chainId}`
    );
    return false;
  }
  const tokenAddress = entry.address;

  const client = getProviderForChain(chainId);

  // Determine start block
  let startBlock: bigint;
  if (fromBlock !== undefined) {
    startBlock = BigInt(fromBlock);
  } else if (entry.blockCreated) {
    startBlock = BigInt(entry.blockCreated);
  } else {
    startBlock = 0n;
  }

  const currentBlock = await client.getBlockNumber();
  const totalBatches = Number(
    (currentBlock - startBlock + BigInt(BLOCK_BATCH_SIZE) - 1n) /
      BigInt(BLOCK_BATCH_SIZE)
  );

  console.log(
    `[reindexCollateralTransfers] Chain ${chainId}, token ${tokenAddress}`
  );
  console.log(
    `[reindexCollateralTransfers] Reindexing from block ${startBlock} to ${currentBlock} (${totalBatches} batches)`
  );

  // Reset cursor so the live indexer doesn't skip blocks we haven't reached yet
  const cursorKey = `${INDEXER_STATE_KEY}:${chainId}`;
  await prisma.keyValueStore.upsert({
    where: { key: cursorKey },
    create: { key: cursorKey, value: startBlock.toString() },
    update: { value: startBlock.toString() },
  });

  let totalIndexed = 0;
  let batchIndex = 0;

  for (
    let start = startBlock;
    start <= currentBlock;
    start += BigInt(BLOCK_BATCH_SIZE)
  ) {
    const end =
      start + BigInt(BLOCK_BATCH_SIZE) - 1n > currentBlock
        ? currentBlock
        : start + BigInt(BLOCK_BATCH_SIZE) - 1n;

    batchIndex++;
    if (batchIndex % 50 === 0 || batchIndex === 1) {
      console.log(
        `[reindexCollateralTransfers] Batch ${batchIndex}/${totalBatches} (blocks ${start}..${end})`
      );
    }

    const logs = await getLogsWithRetry(client, {
      address: tokenAddress as `0x${string}`,
      event: TRANSFER_EVENT,
      fromBlock: start,
      toBlock: end,
    });

    if (logs.length > 0) {
      // Fetch block timestamps
      const uniqueBlocks = [
        ...new Set(
          logs
            .map((log) => log.blockNumber)
            .filter((bn): bn is bigint => bn !== null)
        ),
      ];
      const blockTimestamps = new Map<bigint, Date>();
      for (let i = 0; i < uniqueBlocks.length; i += TIMESTAMP_CHUNK_SIZE) {
        const chunk = uniqueBlocks.slice(i, i + TIMESTAMP_CHUNK_SIZE);
        await Promise.all(
          chunk.map(async (blockNumber) => {
            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
              try {
                const block = await client.getBlock({ blockNumber });
                blockTimestamps.set(
                  blockNumber,
                  new Date(Number(block.timestamp) * 1000)
                );
                break;
              } catch (error) {
                if (attempt === MAX_RETRIES) throw error;
                await new Promise((r) =>
                  setTimeout(r, RETRY_DELAY_MS * attempt)
                );
              }
            }
          })
        );
      }

      const records = logs
        .filter(
          (log) => log.args.from && log.args.to && log.args.value !== undefined
        )
        .map((log) => ({
          chainId,
          blockNumber: Number(log.blockNumber ?? 0),
          timestamp:
            (log.blockNumber != null
              ? blockTimestamps.get(log.blockNumber)
              : undefined) ?? new Date(),
          transactionHash: log.transactionHash,
          logIndex: log.logIndex ?? 0,
          from: log.args.from!.toLowerCase(),
          to: log.args.to!.toLowerCase(),
          value: log.args.value!.toString(),
        }));

      if (records.length > 0) {
        await prisma.collateralTransfer.createMany({
          data: records,
          skipDuplicates: true,
        });
        totalIndexed += records.length;
      }
    }

    // Advance cursor as we go so the live indexer can resume if this job is interrupted
    await prisma.keyValueStore.upsert({
      where: { key: cursorKey },
      create: { key: cursorKey, value: Number(end).toString() },
      update: { value: Number(end).toString() },
    });
  }

  console.log(
    `[reindexCollateralTransfers] Done. Indexed ${totalIndexed} transfers. Cursor set to block ${currentBlock}.`
  );
  return true;
}
