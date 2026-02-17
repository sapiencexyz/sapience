import prisma from '../../../../db';
import { decodeEventLog, type Log, type Block } from 'viem';
import Sentry from '../../../../instrument';
import {
  scoreSelectedForecastsForSettledMarket,
  computeAndStoreMarketTwErrors,
} from '../../../../helpers/scoringService';
import { CONDITION_RESOLVED_EVENT_ABI } from '../constants';
import type { ConditionResolvedEvent } from '../types';
import type { HandlerContext } from '../handlerContext';

export async function processConditionResolved(
  _ctx: HandlerContext,
  log: Log,
  block: Block
): Promise<void> {
  try {
    const decoded = decodeEventLog({
      abi: CONDITION_RESOLVED_EVENT_ABI,
      data: log.data,
      topics: log.topics,
    }) as { args: ConditionResolvedEvent };

    const conditionId = decoded.args.conditionId.toLowerCase();

    const eventData = {
      eventType: 'ConditionResolved',
      conditionId,
      resolvedToYes: decoded.args.resolvedToYes,
      invalid: decoded.args.invalid,
      payoutDenominator: decoded.args.payoutDenominator.toString(),
      noPayout: decoded.args.noPayout.toString(),
      yesPayout: decoded.args.yesPayout.toString(),
      timestamp: decoded.args.timestamp.toString(),
      blockNumber: Number(log.blockNumber),
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
      blockTimestamp: Number(block.timestamp),
    };

    // Skip duplicates
    const eventKey = {
      transactionHash: log.transactionHash || '',
      blockNumber: Number(log.blockNumber || 0),
      logIndex: log.logIndex || 0,
    } as const;

    const existingEvent = await prisma.event.findFirst({
      where: {
        transactionHash: eventKey.transactionHash,
        blockNumber: eventKey.blockNumber,
        logIndex: eventKey.logIndex,
      },
    });

    if (existingEvent) {
      console.log(
        `[PredictionMarketIndexer] Skipping duplicate ConditionResolved event tx=${eventKey.transactionHash} block=${eventKey.blockNumber} logIndex=${eventKey.logIndex}`
      );
      return;
    }

    // Update Condition status
    try {
      const condition = await prisma.condition.findUnique({
        where: { id: conditionId },
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
          // Still create the event even if we skip the condition update
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
            `[PredictionMarketIndexer] Skipping ConditionResolved for ${conditionId}: ` +
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
                settledAt: Number(decoded.args.timestamp),
              },
            });
          });
          console.log(
            `[PredictionMarketIndexer] Updated Condition ${conditionId} to settled via ConditionResolved`
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
                `[PredictionMarketIndexer] Scored forecasts and computed TW errors for ${conditionId}`
              );
            } catch (scoringError) {
              console.error(
                `[PredictionMarketIndexer] Error scoring forecasts for ${conditionId}:`,
                scoringError
              );
            }
          }
        }
      } else {
        // No condition found, just create the event
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
          `[PredictionMarketIndexer] ConditionResolved but no matching Condition found for conditionId=${conditionId}`
        );
      }
    } catch (conditionError) {
      console.error(
        '[PredictionMarketIndexer] Failed to update Condition on ConditionResolved:',
        conditionError
      );
    }

    console.log(
      `[PredictionMarketIndexer] Processed ConditionResolved: conditionId=${conditionId}, resolvedToYes=${eventData.resolvedToYes}, invalid=${eventData.invalid}`
    );
  } catch (error) {
    console.error(
      '[PredictionMarketIndexer] Error processing ConditionResolved:',
      error
    );
    Sentry.captureException(error);
  }
}
