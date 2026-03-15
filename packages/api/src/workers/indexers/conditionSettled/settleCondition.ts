import prisma from '../../../db';
import Sentry from '../../../instrument';
import {
  scoreSelectedForecastsForSettledMarket,
  computeAndStoreMarketTwErrors,
} from '../../../helpers/scoringService';
import { resolvePickConfigsForCondition } from './resolvePickConfigs';
import type { Prisma } from '../../../../generated/prisma';
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

  if (!log.transactionHash || log.blockNumber == null || log.logIndex == null) {
    throw new Error(
      `${tag} Log is missing required fields for deduplication (tx=${log.transactionHash}, block=${log.blockNumber}, logIndex=${log.logIndex})`
    );
  }

  // Capture validated values before the transaction callback so TypeScript
  // narrowing is preserved (narrowing doesn't cross async boundaries).
  const eventKey = {
    transactionHash: log.transactionHash,
    blockNumber: Number(log.blockNumber),
    logIndex: log.logIndex,
  } as const;

  const eventRow = {
    ...eventKey,
    timestamp: BigInt(block.timestamp),
    logData: eventData as Prisma.InputJsonValue,
  };

  // All DB reads and writes happen inside a single transaction to prevent
  // race conditions between concurrent indexer instances.
  const settledCondition = await prisma.$transaction(async (tx) => {
    // Dedup check inside the transaction to prevent races
    const existingEvent = await tx.event.findFirst({
      where: eventKey,
    });

    if (existingEvent) {
      console.log(
        `${tag} Skipping duplicate event tx=${eventKey.transactionHash} block=${eventKey.blockNumber} logIndex=${eventKey.logIndex}`
      );
      return null;
    }

    const condition = await tx.condition.findUnique({
      where: { id: conditionId },
    });

    if (!condition) {
      await tx.event.create({ data: eventRow });
      console.warn(
        `${tag} Settled but no matching Condition found for conditionId=${conditionId}`
      );
      return null;
    }

    const eventSourceAddress = log.address?.toLowerCase();
    const conditionResolver = condition.resolver?.toLowerCase();

    if (conditionResolver) {
      if (!eventSourceAddress) {
        await tx.event.create({ data: eventRow });
        Sentry.captureMessage(
          `${tag} Settlement event has no source address but condition ${conditionId} expects resolver ${conditionResolver}`,
          'warning'
        );
        return null;
      }
      if (conditionResolver !== eventSourceAddress) {
        await tx.event.create({ data: eventRow });
        Sentry.captureMessage(
          `${tag} Resolver mismatch for ${conditionId}: event source ${eventSourceAddress} does not match condition resolver ${conditionResolver}`,
          'warning'
        );
        return null;
      }
    }

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

    return condition;
  });

  if (!settledCondition) return;

  console.log(`${tag} Updated Condition ${conditionId} to settled`);

  // Score forecasts outside the transaction — scoring is idempotent and can
  // be retried independently if it fails.
  const resolverAddress = settledCondition.resolver?.toLowerCase();
  if (resolverAddress) {
    try {
      await scoreSelectedForecastsForSettledMarket(
        resolverAddress,
        settledCondition.id
      );
      await computeAndStoreMarketTwErrors(resolverAddress, settledCondition.id);
      console.log(
        `${tag} Scored forecasts and computed TW errors for ${conditionId}`
      );
    } catch (scoringError) {
      console.error(
        `${tag} Error scoring forecasts for ${conditionId}:`,
        scoringError
      );
      Sentry.captureException(scoringError, {
        tags: { conditionId, resolverAddress },
      });
    }
  }
}
