import prisma from '../../db';
import { initializeDataSource } from '../../db';
import { getProviderForChain } from '../../utils/utils';
import { parseAbiItem } from 'viem';

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)'
);
const BLOCK_BATCH_SIZE = 1000;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const INDEXER_STATE_KEY = 'v2-transfer-indexer';

/**
 * Reindex ERC20 Transfer events on position tokens.
 *
 * Resets the transfer indexer cursor and replays all Transfer events from
 * `fromBlock` (or the earliest Prediction creation block) to the current block.
 *
 * Usage: tsx src/workers/worker.ts reindexTransfers <chainId> [fromBlock]
 */
export async function reindexTransfers(
  chainId: number,
  fromBlock?: number
): Promise<boolean> {
  await initializeDataSource();

  const client = getProviderForChain(chainId);

  // Build the watch list from Picks table (include all configs, even fullyRedeemed)
  const configs = await prisma.picks.findMany({
    where: {
      chainId,
      predictorToken: { not: null },
      counterpartyToken: { not: null },
    },
    select: {
      id: true,
      predictorToken: true,
      counterpartyToken: true,
    },
  });

  const tokenAddresses: `0x${string}`[] = [];
  const tokenInfoMap = new Map<
    string,
    { pickConfigId: string; isPredictorToken: boolean }
  >();

  for (const config of configs) {
    if (config.predictorToken) {
      const addr = config.predictorToken.toLowerCase() as `0x${string}`;
      tokenAddresses.push(addr);
      tokenInfoMap.set(addr, {
        pickConfigId: config.id,
        isPredictorToken: true,
      });
    }
    if (config.counterpartyToken) {
      const addr = config.counterpartyToken.toLowerCase() as `0x${string}`;
      tokenAddresses.push(addr);
      tokenInfoMap.set(addr, {
        pickConfigId: config.id,
        isPredictorToken: false,
      });
    }
  }

  if (tokenAddresses.length === 0) {
    console.log(
      '[reindexTransfers] No token addresses found in Picks table — nothing to index'
    );
    return true;
  }

  console.log(
    `[reindexTransfers] Watching ${tokenAddresses.length} token addresses from ${configs.length} pick configs`
  );

  // Determine start block: use explicit fromBlock, or default to ~7 days ago
  let startBlock: bigint;
  if (fromBlock !== undefined) {
    startBlock = BigInt(fromBlock);
  } else {
    const current = await client.getBlockNumber();
    const sevenDaysOfBlocks = BigInt(7 * 24 * 3600) / 2n;
    startBlock = current > sevenDaysOfBlocks ? current - sevenDaysOfBlocks : 0n;
    console.log(
      `[reindexTransfers] No fromBlock specified, defaulting to ~7 days ago (block ${startBlock})`
    );
  }

  const currentBlock = await client.getBlockNumber();
  console.log(
    `[reindexTransfers] Reindexing transfers from block ${startBlock} to ${currentBlock}`
  );

  // Load already-processed events for dedup (keyed by txHash:logIndex)
  console.log('[reindexTransfers] Loading existing events for dedup...');
  const existingEvents = await prisma.event.findMany({
    where: {
      logData: { path: ['source'], equals: 'PositionTokenTransfer' },
    },
    select: { transactionHash: true, logIndex: true },
  });
  const processedSet = new Set(
    existingEvents.map((e) => `${e.transactionHash}:${e.logIndex}`)
  );
  console.log(
    `[reindexTransfers] Loaded ${processedSet.size} already-processed events for dedup`
  );

  const blockTimestamps = new Map<bigint, bigint>();
  let transferCount = 0;
  let skippedCount = 0;
  const totalBatches = Number(
    (currentBlock - startBlock + BigInt(BLOCK_BATCH_SIZE) - 1n) /
      BigInt(BLOCK_BATCH_SIZE)
  );
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
    if (batchIndex % 10 === 0 || batchIndex === 1) {
      console.log(
        `[reindexTransfers] Processing batch ${batchIndex}/${totalBatches} (blocks ${start}..${end})`
      );
    }

    const logs = await client.getLogs({
      address: tokenAddresses,
      event: TRANSFER_EVENT,
      fromBlock: start,
      toBlock: end,
    });

    if (logs.length > 0) {
      console.log(
        `[reindexTransfers] Found ${logs.length} events in blocks ${start}..${end}`
      );
    }

    for (const log of logs) {
      const { from, to, value } = log.args;
      if (!from || !to || value === undefined) continue;

      const fromLower = from.toLowerCase();
      const toLower = to.toLowerCase();
      const tokenAddress = log.address.toLowerCase();

      // Skip mints — handled by escrow indexer on PredictionCreated
      if (fromLower === ZERO_ADDRESS) continue;
      if (value === 0n) continue;

      // Dedup: skip events already processed by the live indexer
      const eventKey = `${log.transactionHash}:${log.logIndex}`;
      if (processedSet.has(eventKey)) {
        skippedCount++;
        continue;
      }

      const info = tokenInfoMap.get(tokenAddress);
      if (!info) continue;

      const valueStr = value.toString();
      const isBurn = toLower === ZERO_ADDRESS;

      // Decrement sender balance
      await prisma.$executeRaw`
        UPDATE "Position"
        SET balance = (balance::NUMERIC - ${valueStr}::NUMERIC)::TEXT, "updatedAt" = NOW()
        WHERE "chainId" = ${chainId}
          AND "tokenAddress" = ${tokenAddress}
          AND holder = ${fromLower}
      `;

      // Upsert receiver balance (skip for burns — no recipient)
      if (!isBurn) {
        await prisma.$executeRaw`
          INSERT INTO "Position" ("chainId", "tokenAddress", "pickConfigId", "isPredictorToken", holder, balance, "createdAt", "updatedAt")
          VALUES (${chainId}, ${tokenAddress}, ${info.pickConfigId}, ${info.isPredictorToken}, ${toLower}, ${valueStr}, NOW(), NOW())
          ON CONFLICT ("chainId", "tokenAddress", holder)
          DO UPDATE SET balance = ("Position".balance::NUMERIC + ${valueStr}::NUMERIC)::TEXT, "updatedAt" = NOW()
        `;
      }

      // Record event for future dedup
      const blockNum = log.blockNumber ?? 0n;
      if (!blockTimestamps.has(blockNum)) {
        const block = await client.getBlock({ blockNumber: blockNum });
        blockTimestamps.set(blockNum, block.timestamp);
      }
      await prisma.event.create({
        data: {
          blockNumber: Number(blockNum),
          transactionHash: log.transactionHash || '',
          timestamp: blockTimestamps.get(blockNum)!,
          logIndex: log.logIndex || 0,
          logData: {
            source: 'PositionTokenTransfer',
            chainId,
            eventName: isBurn ? 'Burn' : 'Transfer',
            args: {
              from: fromLower,
              to: toLower,
              value: valueStr,
              tokenAddress,
            },
          },
        },
      });

      console.log(
        `[reindexTransfers] ${isBurn ? 'Burn' : 'Transfer'} ${tokenAddress}: ${fromLower} -> ${toLower} amount=${valueStr} block=${blockNum} tx=${log.transactionHash}`
      );
      transferCount++;
    }
  }

  // Update the cursor so the live indexer picks up from here
  const cursorKey = `${INDEXER_STATE_KEY}:${chainId}`;
  await prisma.keyValueStore.upsert({
    where: { key: cursorKey },
    create: {
      key: cursorKey,
      value: currentBlock.toString(),
    },
    update: { value: currentBlock.toString() },
  });

  console.log(
    `[reindexTransfers] Done. Processed ${transferCount} transfers, skipped ${skippedCount} (already indexed). Cursor set to block ${currentBlock}.`
  );
  return true;
}
