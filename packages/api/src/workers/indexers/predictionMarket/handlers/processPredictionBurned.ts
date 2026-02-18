import prisma from '../../../../db';
import { decodeEventLog, type Log, type Block } from 'viem';
import Sentry from '../../../../instrument';
import { PREDICTION_MARKET_ABI } from '../constants';
import type { PredictionBurnedEvent } from '../types';
import type { HandlerContext } from '../handlerContext';

export async function processPredictionBurned(
  ctx: HandlerContext,
  log: Log,
  block: Block
): Promise<void> {
  try {
    const decoded = decodeEventLog({
      abi: PREDICTION_MARKET_ABI,
      data: log.data,
      topics: log.topics,
    }) as { args: PredictionBurnedEvent };

    const eventData = {
      eventType: 'PredictionBurned',
      maker: decoded.args.maker,
      taker: decoded.args.taker,
      makerNftTokenId: decoded.args.makerNftTokenId.toString(),
      takerNftTokenId: decoded.args.takerNftTokenId.toString(),
      totalCollateral: decoded.args.totalCollateral.toString(),
      makerWon: decoded.args.makerWon,
      refCode: decoded.args.refCode,
      blockNumber: Number(log.blockNumber),
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
      timestamp: Number(block.timestamp),
    };

    // Skip duplicates
    const burnedKey = {
      transactionHash: log.transactionHash || '',
      blockNumber: Number(log.blockNumber || 0),
      logIndex: log.logIndex || 0,
    } as const;

    const existingBurned = await prisma.event.findFirst({
      where: {
        transactionHash: burnedKey.transactionHash,
        blockNumber: burnedKey.blockNumber,
        logIndex: burnedKey.logIndex,
      },
    });

    if (existingBurned) {
      console.log(
        `[PredictionMarketIndexer] Event already exists tx=${burnedKey.transactionHash} block=${burnedKey.blockNumber} logIndex=${burnedKey.logIndex}`
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

      if (existingPosition && existingPosition.status === 'settled') {
        console.log(
          `[PredictionMarketIndexer] Position already settled for NFTs ${eventData.makerNftTokenId}/${eventData.takerNftTokenId}`
        );
        return;
      } else if (existingPosition) {
        console.log(
          `[PredictionMarketIndexer] Event exists but position not settled - updating position for NFTs ${eventData.makerNftTokenId}/${eventData.takerNftTokenId}`
        );
        // Recovery: update position in its own transaction
        await prisma.$transaction(async (tx) => {
          await tx.position.update({
            where: { id: existingPosition.id },
            data: {
              status: 'settled',
              predictorWon: eventData.makerWon,
              settledAt: Number(block.timestamp),
            },
          });
        });
        console.log(
          `[PredictionMarketIndexer] Processed PredictionBurned (recovery): ${eventData.makerNftTokenId}, ${eventData.takerNftTokenId}`
        );
        return;
      } else {
        console.log(
          `[PredictionMarketIndexer] Event exists but position not found for NFTs ${eventData.makerNftTokenId}/${eventData.takerNftTokenId}`
        );
        return;
      }
    } else {
      // Find position before transaction so we can update atomically
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
              status: 'settled',
              predictorWon: eventData.makerWon,
              settledAt: Number(block.timestamp),
            },
          });
        }
      });
    }

    console.log(
      `[PredictionMarketIndexer] Processed PredictionBurned: ${eventData.makerNftTokenId}, ${eventData.takerNftTokenId}, winner: ${eventData.makerWon ? 'predictor' : 'counterparty'}`
    );
  } catch (error) {
    console.error(
      '[PredictionMarketIndexer] Error processing PredictionBurned:',
      error
    );
    Sentry.captureException(error);
  }
}
