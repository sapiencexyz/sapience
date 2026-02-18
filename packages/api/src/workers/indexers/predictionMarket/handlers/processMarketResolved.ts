import prisma from '../../../../db';
import { decodeEventLog, type Log, type Block } from 'viem';
import Sentry from '../../../../instrument';
import {
  scoreSelectedForecastsForSettledMarket,
  computeAndStoreMarketTwErrors,
} from '../../../../helpers/scoringService';
import { PREDICTION_MARKET_ABI } from '../constants';
import type { MarketResolvedEvent } from '../types';
import type { HandlerContext } from '../handlerContext';

export async function processMarketResolved(
  _ctx: HandlerContext,
  log: Log,
  block: Block
): Promise<void> {
  try {
    const decoded = decodeEventLog({
      abi: PREDICTION_MARKET_ABI,
      data: log.data,
      topics: log.topics,
    }) as { args: MarketResolvedEvent };

    const eventData = {
      eventType: 'MarketResolved',
      marketId: decoded.args.marketId,
      resolvedToYes: decoded.args.resolvedToYes,
      assertedTruthfully: decoded.args.assertedTruthfully,
      resolutionTime: decoded.args.resolutionTime.toString(),
      blockNumber: Number(log.blockNumber),
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
      timestamp: Number(block.timestamp),
    };

    const marketResolvedKey = {
      transactionHash: log.transactionHash || '',
      blockNumber: Number(log.blockNumber || 0),
      logIndex: log.logIndex || 0,
    } as const;

    const existingMarketResolved = await prisma.event.findFirst({
      where: {
        transactionHash: marketResolvedKey.transactionHash,
        blockNumber: marketResolvedKey.blockNumber,
        logIndex: marketResolvedKey.logIndex,
      },
    });

    if (existingMarketResolved) {
      console.log(
        `[PredictionMarketIndexer] Skipping duplicate MarketResolved event tx=${marketResolvedKey.transactionHash} block=${marketResolvedKey.blockNumber} logIndex=${marketResolvedKey.logIndex}`
      );
      return;
    }

    // Update Condition status
    try {
      const condition = await prisma.condition.findUnique({
        where: { id: eventData.marketId },
      });

      if (condition) {
        // Only mark as settled if the event came from the condition's resolver
        // or if the condition doesn't have a specific resolver set
        const eventSourceAddress = log.address?.toLowerCase();
        const conditionResolver = condition.resolver?.toLowerCase();

        if (
          conditionResolver &&
          eventSourceAddress &&
          conditionResolver !== eventSourceAddress
        ) {
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
            `[PredictionMarketIndexer] Skipping MarketResolved for ${eventData.marketId}: ` +
              `event source ${eventSourceAddress} does not match condition resolver ${conditionResolver}`
          );
        } else {
          await prisma.$transaction(async (tx) => {
            await tx.event.create({
              data: {
                blockNumber: Number(log.blockNumber || 0),
                transactionHash: log.transactionHash || '',
                timestamp: BigInt(block.timestamp),
                logIndex: log.logIndex || 0,
                logData: eventData,
              },
            });

            await tx.condition.update({
              where: { id: condition.id },
              data: {
                settled: true,
                resolvedToYes: eventData.resolvedToYes,
                settledAt: Number(block.timestamp),
              },
            });
          });
          console.log(
            `[PredictionMarketIndexer] Updated Condition ${eventData.marketId} to settled`
          );

          // Score forecasts and compute TW errors for the accuracy leaderboard
          const marketAddress = condition.resolver?.toLowerCase();
          if (marketAddress) {
            try {
              await scoreSelectedForecastsForSettledMarket(
                marketAddress,
                condition.id
              );
              await computeAndStoreMarketTwErrors(
                marketAddress,
                condition.id
              );
              console.log(
                `[PredictionMarketIndexer] Scored forecasts and computed TW errors for ${eventData.marketId}`
              );
            } catch (scoringError) {
              console.error(
                `[PredictionMarketIndexer] Error scoring forecasts for ${eventData.marketId}:`,
                scoringError
              );
            }
          }
        }
      } else {
        await prisma.event.create({
          data: {
            blockNumber: Number(log.blockNumber || 0),
            transactionHash: log.transactionHash || '',
            timestamp: BigInt(block.timestamp),
            logIndex: log.logIndex || 0,
            logData: eventData,
          },
        });
        console.warn(
          `[PredictionMarketIndexer] MarketResolved but no matching Condition found for marketId=${eventData.marketId}`
        );
      }
    } catch (conditionError) {
      console.error(
        '[PredictionMarketIndexer] Failed to update Condition on resolve:',
        conditionError
      );
    }

    console.log(
      `[PredictionMarketIndexer] Processed MarketResolved: marketId=${eventData.marketId}, resolvedToYes=${eventData.resolvedToYes}`
    );
  } catch (error) {
    console.error(
      '[PredictionMarketIndexer] Error processing MarketResolved:',
      error
    );
    Sentry.captureException(error);
  }
}
