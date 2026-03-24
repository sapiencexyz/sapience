import { decodeAbiParameters, type Log, type Block } from 'viem';
import Sentry from '../../../instrument';
import type { HandlerContext } from './handlerContext';
import { settleCondition } from './settleCondition';

/**
 * ABI parameter types for the unified ConditionResolved event from IConditionResolver.
 *
 * Solidity signature:
 *   ConditionResolved(
 *     bytes   conditionId,          // non-indexed
 *     bool    isIndecisive,         // non-indexed
 *     bool    resolvedToYes         // non-indexed
 *   )
 *
 * All params are non-indexed, so everything lives in log.data.
 * topic0 = keccak256("ConditionResolved(bytes,bool,bool)")
 *        = 0xd51b7654de6c35da107817ecef62e0a008d0d246709c53babba4e32a40fb5b66
 */
const CONDITION_RESOLVED_DATA_PARAMS = [
  { type: 'bytes', name: 'conditionId' },
  { type: 'bool', name: 'isIndecisive' },
  { type: 'bool', name: 'resolvedToYes' },
] as const;

export async function processConditionResolved(
  ctx: HandlerContext,
  log: Log,
  block: Block
): Promise<void> {
  const tag = `[ConditionSettledIndexer:${ctx.chainId}]`;
  try {
    if (!log.data) {
      throw new Error(
        `${tag} ConditionResolved event has no data field (tx=${log.transactionHash})`
      );
    }

    const [conditionIdBytes, isIndecisive, resolvedToYes] =
      decodeAbiParameters(CONDITION_RESOLVED_DATA_PARAMS, log.data);

    const conditionId = (conditionIdBytes as string).toLowerCase();

    await settleCondition(tag, log, block, {
      conditionId,
      resolvedToYes,
      nonDecisive: isIndecisive,
      eventData: {
        eventType: 'ConditionResolved',
        conditionId,
        isIndecisive,
        resolvedToYes,
        blockNumber: Number(log.blockNumber),
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        blockTimestamp: Number(block.timestamp),
      },
    });
  } catch (error) {
    console.error(`${tag} Error processing ConditionResolved:`, error);
    Sentry.captureException(error);
  }
}
