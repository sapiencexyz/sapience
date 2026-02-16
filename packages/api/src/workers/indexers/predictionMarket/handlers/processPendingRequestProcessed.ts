import prisma from '../../../../db';
import { decodeEventLog, type Log, type Block } from 'viem';
import Sentry from '../../../../instrument';
import { PENDING_REQUEST_PROCESSED_ABI } from '../constants';
import type { PendingRequestProcessedEvent } from '../types';
import type { HandlerContext } from '../handlerContext';

export async function processPendingRequestProcessed(
  ctx: HandlerContext,
  log: Log,
  block: Block
): Promise<void> {
  try {
    const decoded = decodeEventLog({
      abi: PENDING_REQUEST_PROCESSED_ABI,
      data: log.data,
      topics: log.topics,
    }) as { args: PendingRequestProcessedEvent };

    const eventType = decoded.args.direction ? 'deposit' : 'withdrawal';

    const eventData = {
      eventType,
      user: decoded.args.user,
      assets: decoded.args.assets.toString(),
      shares: decoded.args.shares.toString(),
      blockNumber: Number(log.blockNumber),
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
      timestamp: Number(block.timestamp),
    };

    // Use upsert to handle concurrent indexing safely
    const eventKey = {
      chainId: ctx.chainId,
      transactionHash: log.transactionHash || '',
      logIndex: log.logIndex || 0,
    } as const;

    const eventRecord = {
      chainId: ctx.chainId,
      blockNumber: eventData.blockNumber,
      transactionHash: eventData.transactionHash || '',
      timestamp: eventData.timestamp,
      logIndex: eventData.logIndex || 0,
      eventType: eventData.eventType,
      user: eventData.user.toLowerCase(),
      assets: eventData.assets,
      shares: eventData.shares,
    };

    await prisma.vaultFlowEvent.upsert({
      where: {
        chainId_transactionHash_logIndex: eventKey,
      },
      create: eventRecord,
      update: {}, // No-op if already exists
    });

    console.log(
      `[PredictionMarketIndexer] Processed PendingRequestProcessed: ${eventType} user=${eventData.user} assets=${eventData.assets}`
    );
  } catch (error) {
    console.error(
      '[PredictionMarketIndexer] Error processing PendingRequestProcessed:',
      error
    );
    Sentry.captureException(error);
  }
}
