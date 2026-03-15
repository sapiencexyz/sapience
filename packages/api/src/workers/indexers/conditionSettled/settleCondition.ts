import prisma from '../../../db';
import {
  scoreSelectedForecastsForSettledMarket,
  computeAndStoreMarketTwErrors,
} from '../../../helpers/scoringService';
import { resolvePickConfigsForCondition } from './resolvePickConfigs';
import type { Log, Block } from 'viem';

/**
 * Shared settlement pipeline used by both processConditionSettled and
 * processPythMarketSettled after they decode their respective ABI events.
 */
export interface SettlementInput {
  conditionId: string;
  resolvedToYes: boolean;
  nonDecisive: boolean;
  /** Arbitrary JSON stored alongside the event row. */
  eventData: Record<string, unknown>;
}

export async function settleCondition(
  tag: string,
  log: Log,
  block: Block,
  input: SettlementInput
): Promise<void> {
  const { conditionId, resolvedToYes, nonDecisive, eventData } = input;

  const eventKey = {
    transactionHash: log.transactionHash || '',
    blockNumber: Number(log.blockNumber || 0),
    logIndex: log.logIndex || 0,
  } as const;

  // Skip duplicates
  const existingEvent = await prisma.event.findFirst({
    where: {
      transactionHash: eventKey.transactionHash,
      blockNumber: eventKey.blockNumber,
      logIndex: eventKey.logIndex,
    },
  });

  if (existingEvent) {
    console.log(
      `${tag} Skipping duplicate event tx=${eventKey.transactionHash} block=${eventKey.blockNumber} logIndex=${eventKey.logIndex}`
    );
    return;
  }

  const eventRow = {
    blockNumber: Number(log.blockNumber || 0),
    transactionHash: log.transactionHash || '',
    timestamp: BigInt(block.timestamp),
    logIndex: log.logIndex || 0,
    logData: eventData,
  };

  // Update Condition status
  const condition = await prisma.condition.findUnique({
    where: { id: conditionId },
  });

  if (!condition) {
    await prisma.event.create({ data: eventRow });
    console.warn(
      `${tag} Settled but no matching Condition found for conditionId=${conditionId}`
    );
    return;
  }

  const eventSourceAddress = log.address?.toLowerCase();
  const conditionResolver = condition.resolver?.toLowerCase();

  if (
    conditionResolver &&
    eventSourceAddress &&
    conditionResolver !== eventSourceAddress
  ) {
    // Resolver mismatch — create event but skip condition update
    await prisma.event.create({ data: eventRow });
    console.log(
      `${tag} Skipping settlement for ${conditionId}: ` +
        `event source ${eventSourceAddress} does not match condition resolver ${conditionResolver}`
    );
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.event.create({ data: eventRow });

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
  console.log(`${tag} Updated Condition ${conditionId} to settled`);

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
