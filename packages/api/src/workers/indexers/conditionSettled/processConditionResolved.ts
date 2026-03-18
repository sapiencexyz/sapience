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
 *     (uint256 yesWeight, uint256 noWeight) outcome,  // non-indexed tuple
 *     bool    isIndecisive,         // non-indexed
 *     bool    resolvedToYes         // non-indexed
 *   )
 *
 * All params are non-indexed, so everything lives in log.data.
 * topic0 = keccak256("ConditionResolved(bytes,(uint256,uint256),bool,bool)")
 *        = 0xaa6ea56b5c965c495cbdeecef47c281b1c18725d70b281d93705c5727123a57b
 */
const CONDITION_RESOLVED_DATA_PARAMS = [
  { type: 'bytes', name: 'conditionId' },
  {
    type: 'tuple',
    name: 'outcome',
    components: [
      { type: 'uint256', name: 'yesWeight' },
      { type: 'uint256', name: 'noWeight' },
    ],
  },
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

    const [conditionIdBytes, outcome, isIndecisive, resolvedToYes] =
      decodeAbiParameters(CONDITION_RESOLVED_DATA_PARAMS, log.data);

    const conditionId = (conditionIdBytes as string).toLowerCase();

    await settleCondition(tag, log, block, {
      conditionId,
      resolvedToYes,
      nonDecisive: isIndecisive,
      eventData: {
        eventType: 'ConditionResolved',
        conditionId,
        yesWeight: (outcome as { yesWeight: bigint; noWeight: bigint }).yesWeight.toString(),
        noWeight: (outcome as { yesWeight: bigint; noWeight: bigint }).noWeight.toString(),
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
