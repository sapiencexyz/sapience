import prisma from '../../db';
import { initializeDataSource } from '../../db';
import { getProviderForChain } from '../../utils/utils';
import { parseAbiItem } from 'viem';
import { predictionMarketEscrow } from '@sapience/sdk/contracts';

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)'
);
const BLOCK_BATCH_SIZE = 100;
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

  // Build the watch list from Picks table
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

  // Determine start block
  let startBlock: bigint;
  if (fromBlock !== undefined) {
    startBlock = BigInt(fromBlock);
  } else {
    // Find the earliest Prediction creation block by looking at the IndexerState
    const contractEntry = predictionMarketEscrow[chainId];
    const blockCreated = BigInt(contractEntry?.blockCreated || 0);
    if (blockCreated > 0n) {
      startBlock = blockCreated;
    } else {
      // Fallback: scan from 1000 blocks ago
      const current = await client.getBlockNumber();
      startBlock = current > 1000n ? current - 1000n : 0n;
      console.log(
        `[reindexTransfers] No blockCreated configured, defaulting to block ${startBlock}`
      );
    }
  }

  const currentBlock = await client.getBlockNumber();
  console.log(
    `[reindexTransfers] Reindexing transfers from block ${startBlock} to ${currentBlock}`
  );

  let transferCount = 0;

  for (
    let start = startBlock;
    start <= currentBlock;
    start += BigInt(BLOCK_BATCH_SIZE)
  ) {
    const end =
      start + BigInt(BLOCK_BATCH_SIZE) - 1n > currentBlock
        ? currentBlock
        : start + BigInt(BLOCK_BATCH_SIZE) - 1n;

    const logs = await client.getLogs({
      address: tokenAddresses,
      event: TRANSFER_EVENT,
      fromBlock: start,
      toBlock: end,
    });

    for (const log of logs) {
      const { from, to, value } = log.args;
      if (!from || !to || value === undefined) continue;

      const fromLower = from.toLowerCase();
      const toLower = to.toLowerCase();
      const tokenAddress = log.address.toLowerCase();

      // Skip mints and burns — handled by escrow indexer / backfill
      if (fromLower === ZERO_ADDRESS || toLower === ZERO_ADDRESS) continue;
      if (value === 0n) continue;

      const info = tokenInfoMap.get(tokenAddress);
      if (!info) continue;

      const valueStr = value.toString();

      // Decrement sender balance
      await prisma.$executeRaw`
        UPDATE "Position"
        SET balance = (balance::NUMERIC - ${valueStr}::NUMERIC)::TEXT, "updatedAt" = NOW()
        WHERE "chainId" = ${chainId}
          AND "tokenAddress" = ${tokenAddress}
          AND holder = ${fromLower}
      `;

      // Upsert receiver balance
      await prisma.$executeRaw`
        INSERT INTO "Position" ("chainId", "tokenAddress", "pickConfigId", "isPredictorToken", holder, balance, "createdAt", "updatedAt")
        VALUES (${chainId}, ${tokenAddress}, ${info.pickConfigId}, ${info.isPredictorToken}, ${toLower}, ${valueStr}, NOW(), NOW())
        ON CONFLICT ("chainId", "tokenAddress", holder)
        DO UPDATE SET balance = ("Position".balance::NUMERIC + ${valueStr}::NUMERIC)::TEXT, "updatedAt" = NOW()
      `;

      console.log(
        `[reindexTransfers] Transfer ${tokenAddress}: ${fromLower} -> ${toLower} amount=${valueStr}`
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
    `[reindexTransfers] Done. Processed ${transferCount} transfers. Cursor set to block ${currentBlock}.`
  );
  return true;
}
