import { decodeEventLog, type Log, type Block } from 'viem';
import Sentry from '../../../instrument';
import type { HandlerContext } from './handlerContext';
import { settleCondition } from './settleCondition';

const MANUAL_CONDITION_SETTLED_ABI = [
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

interface ManualConditionSettledEvent {
  conditionId: string;
  yesWeight: bigint;
  noWeight: bigint;
  settler: string;
}

export async function processManualConditionSettled(
  ctx: HandlerContext,
  log: Log,
  block: Block
): Promise<void> {
  const tag = `[ConditionSettledIndexer:${ctx.chainId}]`;
  try {
    const decoded = decodeEventLog({
      abi: MANUAL_CONDITION_SETTLED_ABI,
      data: log.data,
      topics: log.topics,
    }) as { args: ManualConditionSettledEvent };

    const conditionId = decoded.args.conditionId.toLowerCase();
    const { yesWeight, noWeight } = decoded.args;

    const resolvedToYes = yesWeight > 0n && noWeight === 0n;
    const nonDecisive = yesWeight > 0n && noWeight > 0n;

    await settleCondition(tag, log, block, {
      conditionId,
      resolvedToYes,
      nonDecisive,
      eventData: {
        eventType: 'ConditionSettled',
        conditionId,
        yesWeight: yesWeight.toString(),
        noWeight: noWeight.toString(),
        settler: decoded.args.settler,
        blockNumber: Number(log.blockNumber),
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        blockTimestamp: Number(block.timestamp),
      },
    });
  } catch (error) {
    console.error(`${tag} Error processing ManualConditionSettled:`, error);
    Sentry.captureException(error);
  }
}
