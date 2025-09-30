import prisma from '../db';
import { type PublicClient, decodeEventLog, decodeAbiParameters, type Log, type Block, keccak256, toHex } from 'viem';
import { PARLAY_RECONCILE_CONFIG } from './config';
import Sentry from '../instrument';

const PREDICTION_MARKET_CONTRACT_ADDRESS =
  '0x8D1D1946cBc56F695584761d25D13F174906671C';

// PredictionMarket contract ABI for the events we want to reconcile
const PREDICTION_MARKET_ABI = [
  {
    type: 'event',
    name: 'PredictionMinted',
    inputs: [
      { name: 'maker', type: 'address', indexed: true },
      { name: 'taker', type: 'address', indexed: true },
      { name: 'encodedPredictedOutcomes', type: 'bytes', indexed: false },
      { name: 'makerNftTokenId', type: 'uint256', indexed: false },
      { name: 'takerNftTokenId', type: 'uint256', indexed: false },
      { name: 'makerCollateral', type: 'uint256', indexed: false },
      { name: 'takerCollateral', type: 'uint256', indexed: false },
      { name: 'totalCollateral', type: 'uint256', indexed: false },
      { name: 'refCode', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PredictionBurned',
    inputs: [
      { name: 'maker', type: 'address', indexed: true },
      { name: 'taker', type: 'address', indexed: true },
      { name: 'encodedPredictedOutcomes', type: 'bytes', indexed: false },
      { name: 'makerNftTokenId', type: 'uint256', indexed: false },
      { name: 'takerNftTokenId', type: 'uint256', indexed: false },
      { name: 'totalCollateral', type: 'uint256', indexed: false },
      { name: 'makerWon', type: 'bool', indexed: false },
      { name: 'refCode', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PredictionConsolidated',
    inputs: [
      { name: 'makerNftTokenId', type: 'uint256', indexed: true },
      { name: 'takerNftTokenId', type: 'uint256', indexed: true },
      { name: 'totalCollateral', type: 'uint256', indexed: false },
      { name: 'refCode', type: 'bytes32', indexed: false },
    ],
  },
] as const;

interface ProcessingResult {
  scanned: number;
  inserted: number;
  updated: number;
  maxBlockSeen: bigint | null;
}

interface PredictionMintedEvent {
  maker: string;
  taker: string;
  encodedPredictedOutcomes: `0x${string}`;
  makerNftTokenId: bigint;
  takerNftTokenId: bigint;
  makerCollateral: bigint;
  takerCollateral: bigint;
  totalCollateral: bigint;
  refCode: string;
}

interface PredictionBurnedEvent {
  maker: string;
  taker: string;
  makerNftTokenId: bigint;
  takerNftTokenId: bigint;
  totalCollateral: bigint;
  makerWon: boolean;
  refCode: string;
}

interface PredictionConsolidatedEvent {
  makerNftTokenId: bigint;
  takerNftTokenId: bigint;
  totalCollateral: bigint;
  refCode: string;
}

export async function processParlayEventsForBlockRange(
  chainId: number,
  client: PublicClient,
  fromBlock: bigint,
  toBlock: 'latest' | bigint
): Promise<ProcessingResult> {
  console.log(
    `${PARLAY_RECONCILE_CONFIG.logPrefix} Processing parlay events for chain ${chainId}, blocks ${fromBlock} to ${toBlock}`
  );

  let scanned = 0;
  let inserted = 0;
  let updated = 0;
  let maxBlockSeen: bigint | null = null;

  try {
    // Get logs for the PredictionMarket contract
    const logs = await client.getLogs({
      address: PREDICTION_MARKET_CONTRACT_ADDRESS as `0x${string}`,
      fromBlock,
      toBlock,
    });

    scanned = logs.length;
    console.log(
      `${PARLAY_RECONCILE_CONFIG.logPrefix} Found ${logs.length} logs for chain ${chainId}`
    );

    // Process each log
    for (const log of logs) {
      try {
        if (log.blockNumber) {
          maxBlockSeen = maxBlockSeen === null || log.blockNumber > maxBlockSeen 
            ? log.blockNumber 
            : maxBlockSeen;
        }

        // Get block info for timestamp
        const block = await client.getBlock({
          blockNumber: log.blockNumber!,
          includeTransactions: false,
        });

        const result = await processLog(log, block, chainId);
        if (result.type === 'inserted') inserted++;
        else if (result.type === 'updated') updated++;
      } catch (logError) {
        console.error(
          `${PARLAY_RECONCILE_CONFIG.logPrefix} Error processing log:`,
          logError
        );
        Sentry.captureException(logError);
        // Continue processing other logs
      }
    }

    console.log(
      `${PARLAY_RECONCILE_CONFIG.logPrefix} Chain ${chainId} processing complete: scanned=${scanned}, inserted=${inserted}, updated=${updated}`
    );

    return { scanned, inserted, updated, maxBlockSeen };
  } catch (error) {
    console.error(
      `${PARLAY_RECONCILE_CONFIG.logPrefix} Error processing block range for chain ${chainId}:`,
      error
    );
    Sentry.captureException(error);
    throw error;
  }
}

async function processLog(
  log: Log,
  block: Block,
  chainId: number
): Promise<{ type: 'inserted' | 'updated' | 'skipped' }> {
  // Check if this is a PredictionMarket event
  if (
    log.address.toLowerCase() !==
    PREDICTION_MARKET_CONTRACT_ADDRESS.toLowerCase()
  ) {
    return { type: 'skipped' };
  }

  // Decode the event based on the topic
  const predictionMintedTopic = keccak256(
    toHex(
      'PredictionMinted(address,address,bytes,uint256,uint256,uint256,uint256,uint256,bytes32)'
    )
  );
  const predictionBurnedTopic = keccak256(
    toHex(
      'PredictionBurned(address,address,bytes,uint256,uint256,uint256,bool,bytes32)'
    )
  );
  const predictionConsolidatedTopic = keccak256(
    toHex('PredictionConsolidated(uint256,uint256,uint256,bytes32)')
  );

  if (log.topics[0] === predictionMintedTopic) {
    return await processPredictionMinted(log, block, chainId);
  } else if (log.topics[0] === predictionBurnedTopic) {
    return await processPredictionBurned(log, block, chainId);
  } else if (log.topics[0] === predictionConsolidatedTopic) {
    return await processPredictionConsolidated(log, block, chainId);
  }

  return { type: 'skipped' };
}

async function processPredictionMinted(
  log: Log,
  block: Block,
  chainId: number
): Promise<{ type: 'inserted' | 'updated' | 'skipped' }> {
  try {
    const decodedAny = decodeEventLog({
      abi: PREDICTION_MARKET_ABI,
      data: log.data,
      topics: log.topics,
    }) as { args: PredictionMintedEvent };

    const eventData = {
      maker: decodedAny.args.maker,
      taker: decodedAny.args.taker,
      makerNftTokenId: decodedAny.args.makerNftTokenId.toString(),
      takerNftTokenId: decodedAny.args.takerNftTokenId.toString(),
      totalCollateral: decodedAny.args.totalCollateral.toString(),
      refCode: decodedAny.args.refCode,
      timestamp: Number(block.timestamp),
    };

    // Check if parlay already exists
    const existingParlay = await prisma.parlay.findFirst({
      where: {
        chainId,
        marketAddress: log.address.toLowerCase(),
        makerNftTokenId: eventData.makerNftTokenId,
        takerNftTokenId: eventData.takerNftTokenId,
      },
    });

    if (existingParlay) {
      return { type: 'skipped' };
    }

    // Decode predicted outcomes
    const [outcomes] = decodeAbiParameters(
      [
        {
          type: 'tuple[]',
          components: [{ type: 'bytes32' }, { type: 'bool' }],
        },
      ],
      decodedAny.args.encodedPredictedOutcomes
    ) as unknown as [[`0x${string}`, boolean][]];
    
    const predictedOutcomes = outcomes.map(([marketId, prediction]) => ({
      conditionId: marketId,
      prediction,
    }));

    // Compute endsAt from known conditions
    let endsAt: number | null = null;
    try {
      const conditionIds = predictedOutcomes.map((o) => o.conditionId);
      const matched = await prisma.condition.findMany({
        where: { id: { in: conditionIds } },
        select: { id: true, endTime: true },
      });
      if (matched.length > 0) {
        endsAt = matched.reduce(
          (max, c) => (c.endTime > max ? c.endTime : max),
          matched[0].endTime
        );
      }
    } catch (e) {
      console.warn(
        `${PARLAY_RECONCILE_CONFIG.logPrefix} Failed computing endsAt from conditions:`,
        e
      );
    }

    // Create parlay
    await prisma.parlay.create({
      data: {
        chainId,
        marketAddress: log.address.toLowerCase(),
        maker: eventData.maker.toLowerCase(),
        taker: eventData.taker.toLowerCase(),
        makerNftTokenId: eventData.makerNftTokenId,
        takerNftTokenId: eventData.takerNftTokenId,
        totalCollateral: eventData.totalCollateral,
        refCode: eventData.refCode,
        status: 'active',
        makerWon: null,
        mintedAt: eventData.timestamp,
        settledAt: null,
        endsAt: endsAt ?? null,
        predictedOutcomes: predictedOutcomes as unknown as object,
      },
    });

    console.log(
      `${PARLAY_RECONCILE_CONFIG.logPrefix} Created parlay for NFTs ${eventData.makerNftTokenId}/${eventData.takerNftTokenId}`
    );
    return { type: 'inserted' };
  } catch (error) {
    console.error(
      `${PARLAY_RECONCILE_CONFIG.logPrefix} Error processing PredictionMinted:`,
      error
    );
    Sentry.captureException(error);
    return { type: 'skipped' };
  }
}

async function processPredictionBurned(
  log: Log,
  block: Block,
  chainId: number
): Promise<{ type: 'inserted' | 'updated' | 'skipped' }> {
  try {
    const decoded = decodeEventLog({
      abi: PREDICTION_MARKET_ABI,
      data: log.data,
      topics: log.topics,
    }) as { args: PredictionBurnedEvent };

    const eventData = {
      makerNftTokenId: decoded.args.makerNftTokenId.toString(),
      takerNftTokenId: decoded.args.takerNftTokenId.toString(),
      makerWon: decoded.args.makerWon,
      timestamp: Number(block.timestamp),
    };

    // Find and update parlay
    const parlay = await prisma.parlay.findFirst({
      where: {
        chainId,
        marketAddress: log.address.toLowerCase(),
        OR: [
          { makerNftTokenId: eventData.makerNftTokenId },
          { takerNftTokenId: eventData.takerNftTokenId },
        ],
      },
    });

    if (!parlay) {
      console.warn(
        `${PARLAY_RECONCILE_CONFIG.logPrefix} No parlay found for burned NFTs ${eventData.makerNftTokenId}/${eventData.takerNftTokenId}`
      );
      return { type: 'skipped' };
    }

    // Update parlay if not already settled
    if (parlay.status !== 'settled') {
      await prisma.parlay.update({
        where: { id: parlay.id },
        data: {
          status: 'settled',
          makerWon: eventData.makerWon,
          settledAt: eventData.timestamp,
        },
      });
      console.log(
        `${PARLAY_RECONCILE_CONFIG.logPrefix} Updated parlay ${parlay.id} to settled status`
      );
      return { type: 'updated' };
    }

    return { type: 'skipped' };
  } catch (error) {
    console.error(
      `${PARLAY_RECONCILE_CONFIG.logPrefix} Error processing PredictionBurned:`,
      error
    );
    Sentry.captureException(error);
    return { type: 'skipped' };
  }
}

async function processPredictionConsolidated(
  log: Log,
  block: Block,
  chainId: number
): Promise<{ type: 'inserted' | 'updated' | 'skipped' }> {
  try {
    const decoded = decodeEventLog({
      abi: PREDICTION_MARKET_ABI,
      data: log.data,
      topics: log.topics,
    }) as { args: PredictionConsolidatedEvent };

    const eventData = {
      makerNftTokenId: decoded.args.makerNftTokenId.toString(),
      takerNftTokenId: decoded.args.takerNftTokenId.toString(),
      timestamp: Number(block.timestamp),
    };

    // Find and update parlay
    const parlay = await prisma.parlay.findFirst({
      where: {
        chainId,
        marketAddress: log.address.toLowerCase(),
        OR: [
          { makerNftTokenId: eventData.makerNftTokenId },
          { takerNftTokenId: eventData.takerNftTokenId },
        ],
      },
    });

    if (!parlay) {
      console.warn(
        `${PARLAY_RECONCILE_CONFIG.logPrefix} No parlay found for consolidated NFTs ${eventData.makerNftTokenId}/${eventData.takerNftTokenId}`
      );
      return { type: 'skipped' };
    }

    // Update parlay if not already consolidated
    if (parlay.status !== 'consolidated') {
      await prisma.parlay.update({
        where: { id: parlay.id },
        data: {
          status: 'consolidated',
          makerWon: true, // Consolidated means maker won
          settledAt: eventData.timestamp,
        },
      });
      console.log(
        `${PARLAY_RECONCILE_CONFIG.logPrefix} Updated parlay ${parlay.id} to consolidated status`
      );
      return { type: 'updated' };
    }

    return { type: 'skipped' };
  } catch (error) {
    console.error(
      `${PARLAY_RECONCILE_CONFIG.logPrefix} Error processing PredictionConsolidated:`,
      error
    );
    Sentry.captureException(error);
    return { type: 'skipped' };
  }
}
