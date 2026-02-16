import prisma from '../../../../db';
import { decodeEventLog, type Log, type Block } from 'viem';
import Sentry from '../../../../instrument';
import { PREDICTION_MARKET_ABI } from '../constants';
import type { MarketSubmittedToUMAEvent } from '../types';
import type { HandlerContext } from '../handlerContext';

export async function processMarketSubmittedToUMA(
  _ctx: HandlerContext,
  log: Log,
  block: Block
): Promise<void> {
  try {
    const decoded = decodeEventLog({
      abi: PREDICTION_MARKET_ABI,
      data: log.data,
      topics: log.topics,
    }) as { args: MarketSubmittedToUMAEvent };

    const eventData = {
      eventType: 'MarketSubmittedToUMA',
      marketId: decoded.args.marketId,
      assertionId: decoded.args.assertionId,
      asserter: decoded.args.asserter,
      claim: decoded.args.claim,
      resolvedToYes: decoded.args.resolvedToYes,
      blockNumber: Number(log.blockNumber),
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
      timestamp: Number(block.timestamp),
    };

    const submittedKey = {
      transactionHash: log.transactionHash || '',
      blockNumber: Number(log.blockNumber || 0),
      logIndex: log.logIndex || 0,
    } as const;

    const existingEvent = await prisma.event.findFirst({
      where: {
        transactionHash: submittedKey.transactionHash,
        blockNumber: submittedKey.blockNumber,
        logIndex: submittedKey.logIndex,
      },
    });

    // Always update Condition with assertionId (even if event already exists)
    // This ensures reindexing fills in missing data
    try {
      const condition = await prisma.condition.findUnique({
        where: { id: eventData.marketId },
      });

      if (condition) {
        // Update if assertionId or assertionTimestamp is missing
        if (!condition.assertionId || !condition.assertionTimestamp) {
          await prisma.condition.update({
            where: { id: condition.id },
            data: {
              assertionId: eventData.assertionId,
              assertionTimestamp: Number(block.timestamp),
            },
          });
          console.log(
            `[PredictionMarketIndexer] Updated Condition ${eventData.marketId} with assertionId ${eventData.assertionId} and timestamp ${block.timestamp}`
          );
        }
      } else {
        console.warn(
          `[PredictionMarketIndexer] MarketSubmittedToUMA but no matching Condition found for marketId=${eventData.marketId}`
        );
      }
    } catch (conditionError) {
      console.error(
        '[PredictionMarketIndexer] Failed to update Condition on submission:',
        conditionError
      );
    }

    if (existingEvent) {
      console.log(
        `[PredictionMarketIndexer] Skipping duplicate MarketSubmittedToUMA event tx=${submittedKey.transactionHash}`
      );
      return;
    }

    await prisma.event.create({
      data: {
        blockNumber: Number(log.blockNumber || 0),
        transactionHash: log.transactionHash || '',
        timestamp: BigInt(block.timestamp),
        logIndex: log.logIndex || 0,
        logData: eventData,
      },
    });

    console.log(
      `[PredictionMarketIndexer] Processed MarketSubmittedToUMA: marketId=${eventData.marketId}, assertionId=${eventData.assertionId}`
    );
  } catch (error) {
    console.error(
      '[PredictionMarketIndexer] Error processing MarketSubmittedToUMA:',
      error
    );
    Sentry.captureException(error);
  }
}
