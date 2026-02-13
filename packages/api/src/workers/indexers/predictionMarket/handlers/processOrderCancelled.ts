import prisma from '../../../../db';
import { decodeEventLog, type Log, type Block } from 'viem';
import Sentry from '../../../../instrument';
import { PREDICTION_MARKET_ABI } from '../constants';
import type { OrderCancelledEvent } from '../types';
import type { HandlerContext } from '../handlerContext';

export async function processOrderCancelled(
  ctx: HandlerContext,
  log: Log,
  block: Block
): Promise<void> {
  try {
    const decoded = decodeEventLog({
      abi: PREDICTION_MARKET_ABI,
      data: log.data,
      topics: log.topics,
    }) as { args: OrderCancelledEvent };

    const eventData = {
      eventType: 'OrderCancelled',
      orderId: decoded.args.orderId.toString(),
      predictor: decoded.args.maker,
      predictorCollateral: decoded.args.makerCollateral.toString(),
      counterpartyCollateral: decoded.args.takerCollateral.toString(),
      blockNumber: Number(log.blockNumber),
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
      timestamp: Number(block.timestamp),
    };

    const orderCancelledKey = {
      transactionHash: log.transactionHash || '',
      blockNumber: Number(log.blockNumber || 0),
      logIndex: log.logIndex || 0,
    } as const;

    const existingOrderCancelled = await prisma.event.findFirst({
      where: {
        transactionHash: orderCancelledKey.transactionHash,
        blockNumber: orderCancelledKey.blockNumber,
        logIndex: orderCancelledKey.logIndex,
      },
    });

    if (existingOrderCancelled) {
      console.log(
        `[PredictionMarketIndexer] Skipping duplicate OrderCancelled event tx=${orderCancelledKey.transactionHash} block=${orderCancelledKey.blockNumber} logIndex=${orderCancelledKey.logIndex}`
      );
      return;
    }

    await prisma.event.create({
      data: {
        blockNumber: Number(log.blockNumber || 0),
        transactionHash: log.transactionHash || '',
        timestamp: BigInt(block.timestamp),
        logIndex: log.logIndex || 0,
        logData: eventData,
      },
    });

    try {
      const order = await prisma.limitOrder.findUnique({
        where: {
          chainId_marketAddress_orderId: {
            chainId: ctx.chainId,
            marketAddress: log.address.toLowerCase(),
            orderId: eventData.orderId,
          },
        },
      });

      if (order) {
        await prisma.limitOrder.update({
          where: { id: order.id },
          data: {
            status: 'cancelled',
            cancelledAt: Number(block.timestamp),
            cancelledTxHash: log.transactionHash || '',
          },
        });
      } else {
        console.warn(
          `[PredictionMarketIndexer] OrderCancelled but no matching LimitOrder found for orderId=${eventData.orderId}`
        );
      }
    } catch (orderError) {
      console.error(
        '[PredictionMarketIndexer] Failed to update LimitOrder on cancel:',
        orderError
      );
    }

    console.log(
      `[PredictionMarketIndexer] Processed OrderCancelled: orderId=${eventData.orderId}, predictor=${eventData.predictor}`
    );
  } catch (error) {
    console.error(
      '[PredictionMarketIndexer] Error processing OrderCancelled:',
      error
    );
    Sentry.captureException(error);
  }
}
