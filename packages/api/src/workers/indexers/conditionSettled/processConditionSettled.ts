import { decodeEventLog, type Log, type Block } from 'viem';
import Sentry from '../../../instrument';
import type { HandlerContext } from './handlerContext';
import { settleCondition } from './settleCondition';

const CONDITION_SETTLED_EVENT_ABI = [
  {
    type: 'event',
    name: 'ConditionResolved',
    inputs: [
      { name: 'conditionId', type: 'bytes32', indexed: true },
      { name: 'invalid', type: 'bool', indexed: false },
      { name: 'nonDecisive', type: 'bool', indexed: false },
      { name: 'resolvedToYes', type: 'bool', indexed: false },
      { name: 'payoutDenominator', type: 'uint256', indexed: false },
      { name: 'noPayout', type: 'uint256', indexed: false },
      { name: 'yesPayout', type: 'uint256', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
] as const;

interface ConditionSettledEvent {
  conditionId: string;
  invalid: boolean;
  nonDecisive: boolean;
  resolvedToYes: boolean;
  payoutDenominator: bigint;
  noPayout: bigint;
  yesPayout: bigint;
  timestamp: bigint;
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
    const { invalid, nonDecisive, resolvedToYes } = decoded.args;

    await settleCondition(tag, log, block, {
      conditionId,
      resolvedToYes,
      nonDecisive,
      eventData: {
        eventType: 'ConditionResolved',
        conditionId,
        invalid,
        nonDecisive,
        resolvedToYes,
        payoutDenominator: decoded.args.payoutDenominator.toString(),
        noPayout: decoded.args.noPayout.toString(),
        yesPayout: decoded.args.yesPayout.toString(),
        timestamp: decoded.args.timestamp.toString(),
        blockNumber: Number(log.blockNumber),
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        blockTimestamp: Number(block.timestamp),
      },
    });
  } catch (error) {
    console.error(`${tag} Error processing ConditionSettled:`, error);
    Sentry.captureException(error);
  }
}
