import prisma from '../../../../db';
import { decodeEventLog, type Log, type Block } from 'viem';
import Sentry from '../../../../instrument';
import { PREDICTION_MARKET_ABI } from '../constants';
import type { PredictionConsolidatedEvent } from '../types';
import type { HandlerContext } from '../handlerContext';

export async function processPredictionConsolidated(
  ctx: HandlerContext,
  log: Log,
  block: Block
): Promise<void> {
  try {
    const decoded = decodeEventLog({
      abi: PREDICTION_MARKET_ABI,
      data: log.data,
      topics: log.topics,
    }) as { args: PredictionConsolidatedEvent };

    const eventData = {
      eventType: 'PredictionConsolidated',
      makerNftTokenId: decoded.args.makerNftTokenId.toString(),
      takerNftTokenId: decoded.args.takerNftTokenId.toString(),
      totalCollateral: decoded.args.totalCollateral.toString(),
      refCode: decoded.args.refCode,
      blockNumber: Number(log.blockNumber),
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
      timestamp: Number(block.timestamp),
    };

    // Skip duplicates
    const consolidatedKey = {
      transactionHash: log.transactionHash || '',
      blockNumber: Number(log.blockNumber || 0),
      logIndex: log.logIndex || 0,
    } as const;

    const existingConsolidated = await prisma.event.findFirst({
      where: {
        transactionHash: consolidatedKey.transactionHash,
        blockNumber: consolidatedKey.blockNumber,
        logIndex: consolidatedKey.logIndex,
      },
    });

    if (existingConsolidated) {
      console.log(
        `[PredictionMarketIndexer] Event already exists tx=${consolidatedKey.transactionHash} block=${consolidatedKey.blockNumber} logIndex=${consolidatedKey.logIndex}`
      );

      // For reindexing: still check if position needs to be updated (might be missing due to old bug)
      const existingPosition = await prisma.position.findFirst({
        where: {
          chainId: ctx.chainId,
          marketAddress: log.address.toLowerCase(),
          predictorNftTokenId: eventData.makerNftTokenId,
          counterpartyNftTokenId: eventData.takerNftTokenId,
        },
      });

      if (existingPosition && existingPosition.status === 'consolidated') {
        console.log(
          `[PredictionMarketIndexer] Position already consolidated for NFTs ${eventData.makerNftTokenId}/${eventData.takerNftTokenId}`
        );
        return;
      } else if (existingPosition) {
        console.log(
          `[PredictionMarketIndexer] Event exists but position not consolidated - updating position for NFTs ${eventData.makerNftTokenId}/${eventData.takerNftTokenId}`
        );
        // Recovery: update position
        await prisma.$transaction(async (tx) => {
          await tx.position.update({
            where: { id: existingPosition.id },
            data: {
              status: 'consolidated',
              predictorWon: true,
              settledAt: Number(block.timestamp),
            },
          });
        });
        console.log(
          `[PredictionMarketIndexer] Processed PredictionConsolidated (recovery): ${eventData.makerNftTokenId}, ${eventData.takerNftTokenId}`
        );
        return;
      } else {
        console.log(
          `[PredictionMarketIndexer] Event exists but position not found for NFTs ${eventData.makerNftTokenId}/${eventData.takerNftTokenId}`
        );
        return;
      }
    } else {
      const position = await prisma.position.findFirst({
        where: {
          chainId: ctx.chainId,
          marketAddress: log.address.toLowerCase(),
          predictorNftTokenId: eventData.makerNftTokenId,
          counterpartyNftTokenId: eventData.takerNftTokenId,
        },
      });

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

        if (position) {
          await tx.position.update({
            where: { id: position.id },
            data: {
              status: 'consolidated',
              predictorWon: true,
              settledAt: Number(block.timestamp),
            },
          });
        }
      });
    }

    console.log(
      `[PredictionMarketIndexer] Processed PredictionConsolidated: ${eventData.makerNftTokenId}, ${eventData.takerNftTokenId}`
    );
  } catch (error) {
    console.error(
      '[PredictionMarketIndexer] Error processing PredictionConsolidated:',
      error
    );
    Sentry.captureException(error);
  }
}
