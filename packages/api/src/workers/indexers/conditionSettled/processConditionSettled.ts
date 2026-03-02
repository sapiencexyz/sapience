import prisma from '../../../db';
import { decodeEventLog, type Log, type Block } from 'viem';
import Sentry from '../../../instrument';
import {
  scoreSelectedForecastsForSettledMarket,
  computeAndStoreMarketTwErrors,
} from '../../../helpers/scoringService';
import type { HandlerContext } from './handlerContext';
import { resolvePickConfigsForCondition } from './resolvePickConfigs';

const CONDITION_SETTLED_EVENT_ABI = [
  {
    type: 'event',
    name: 'ConditionSettled',
    inputs: [
      { name: 'conditionId', type: 'bytes32', indexed: true },
      { name: 'yesWeight', type: 'uint256', indexed: false },
      { name: 'noWeight', type: 'uint256', indexed: false },
      { name: 'settler', type: 'address', indexed: true },
    ],
  },
] as const;

interface ConditionSettledEvent {
  conditionId: string;
  yesWeight: bigint;
  noWeight: bigint;
  settler: string;
}

export async function processConditionSettled(
  ctx: HandlerContext,
  log: Log,
  block: Block
): Promise<void> {
  const tag = `[ConditionSettledIndexer:${ctx.chainId}]`;
  try {
    const decoded = decodeEventLog({
      abi: CONDITION_SETTLED_EVENT_ABI,
      data: log.data,
      topics: log.topics,
    }) as { args: ConditionSettledEvent };

    const conditionId = decoded.args.conditionId.toLowerCase();

    const resolvedToYes =
      decoded.args.yesWeight > 0n && decoded.args.noWeight === 0n;
    const nonDecisive =
      decoded.args.yesWeight > 0n && decoded.args.noWeight > 0n;

    const eventData = {
      eventType: 'ConditionSettled',
      conditionId,
      yesWeight: decoded.args.yesWeight.toString(),
      noWeight: decoded.args.noWeight.toString(),
      settler: decoded.args.settler,
      resolvedToYes,
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
        `${tag} Skipping duplicate ConditionSettled event tx=${eventKey.transactionHash} block=${eventKey.blockNumber} logIndex=${eventKey.logIndex}`
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
            `${tag} Skipping ConditionSettled for ${conditionId}: ` +
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
                resolvedToYes,
                nonDecisive,
                settledAt: Number(block.timestamp),
              },
            });

            // Resolve any pickConfigs whose conditions are now all settled
            await resolvePickConfigsForCondition(
              tx,
              conditionId,
              Number(block.timestamp)
            );
          });
          console.log(
            `${tag} Updated Condition ${conditionId} to settled via ConditionSettled`
          );

          // Score forecasts and compute TW errors for the accuracy leaderboard
          const resolverAddress = condition.resolver?.toLowerCase();
          if (resolverAddress) {
            try {
              await scoreSelectedForecastsForSettledMarket(
                resolverAddress,
                condition.id
              );
              await computeAndStoreMarketTwErrors(resolverAddress, condition.id);
              console.log(
                `${tag} Scored forecasts and computed TW errors for ${conditionId}`
              );
            } catch (scoringError) {
              console.error(
                `${tag} Error scoring forecasts for ${conditionId}:`,
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
          `${tag} ConditionSettled but no matching Condition found for conditionId=${conditionId}`
        );
      }
    } catch (conditionError) {
      console.error(
        `${tag} Failed to update Condition on ConditionSettled:`,
        conditionError
      );
    }

    console.log(
      `${tag} Processed ConditionSettled: conditionId=${conditionId}, resolvedToYes=${resolvedToYes}, settler=${decoded.args.settler}`
    );
  } catch (error) {
    console.error(
      `${tag} Error processing ConditionSettled:`,
      error
    );
    Sentry.captureException(error);
  }
}
