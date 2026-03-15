import { decodeAbiParameters, type Log, type Block } from 'viem';
import Sentry from '../../../instrument';
import type { HandlerContext } from './handlerContext';
import { settleCondition } from './settleCondition';

/**
 * ABI parameter types for the non-indexed data fields of the MarketSettled event.
 *
 * Full event signature (Solidity):
 *   MarketSettled(
 *     bytes32 indexed conditionIdHash,
 *     bytes32 indexed priceId,
 *     uint64  indexed endTime,
 *     bytes   conditionId,       // non-indexed → in data
 *     bool    resolvedToOver,     // non-indexed → in data
 *     int64   benchmarkPrice,     // non-indexed → in data
 *     int32   benchmarkExpo,      // non-indexed → in data
 *     uint64  publishTime         // non-indexed → in data
 *   )
 *
 * The three indexed params appear in log.topics[1..3]; only the
 * remaining five are ABI-encoded in log.data.
 */
const MARKET_SETTLED_DATA_PARAMS = [
  { type: 'bytes', name: 'conditionId' },
  { type: 'bool', name: 'resolvedToOver' },
  { type: 'int64', name: 'benchmarkPrice' },
  { type: 'int32', name: 'benchmarkExpo' },
  { type: 'uint64', name: 'publishTime' },
] as const;

export async function processPythMarketSettled(
  ctx: HandlerContext,
  log: Log,
  block: Block
): Promise<void> {
  const tag = `[ConditionSettledIndexer:${ctx.chainId}]`;
  try {
    // Indexed params from topics
    const priceId = log.topics[2]; // bytes32
    const endTime = log.topics[3]; // uint64 (zero-padded to bytes32)

    // Non-indexed params from data
    if (!log.data) {
      throw new Error(
        `${tag} MarketSettled event has no data field (tx=${log.transactionHash})`
      );
    }
    const [
      conditionIdBytes,
      resolvedToOver,
      benchmarkPrice,
      benchmarkExpo,
      publishTime,
    ] = decodeAbiParameters(MARKET_SETTLED_DATA_PARAMS, log.data);

    // The conditionId from the event is the full ABI-encoded market params.
    // Lowercase hex it for DB lookup (matches how conditions are stored).
    const conditionId = (conditionIdBytes as string).toLowerCase();

    // On-chain: Over→[1,0]→YES, Under→[0,1]→NO
    const resolvedToYes = resolvedToOver;
    // Pyth markets are always decisive (no ties)
    const nonDecisive = false;

    await settleCondition(tag, log, block, {
      conditionId,
      resolvedToYes,
      nonDecisive,
      eventData: {
        eventType: 'MarketSettled',
        conditionId,
        priceId,
        endTime: endTime ?? null,
        resolvedToOver,
        resolvedToYes,
        nonDecisive,
        benchmarkPrice: benchmarkPrice.toString(),
        benchmarkExpo: Number(benchmarkExpo),
        publishTime: publishTime.toString(),
        blockNumber: Number(log.blockNumber),
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        blockTimestamp: Number(block.timestamp),
      },
    });
  } catch (error) {
    console.error(`${tag} Error processing MarketSettled:`, error);
    Sentry.captureException(error);
  }
}
