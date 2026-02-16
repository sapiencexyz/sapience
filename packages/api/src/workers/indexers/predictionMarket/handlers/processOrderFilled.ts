import prisma from '../../../../db';
import { decodeEventLog, type Log, type Block } from 'viem';
import Sentry from '../../../../instrument';
import { PREDICTION_MARKET_ABI } from '../constants';
import type { OrderFilledEvent } from '../types';
import type { HandlerContext } from '../handlerContext';

export async function processOrderFilled(
  ctx: HandlerContext,
  log: Log,
  block: Block
): Promise<void> {
  try {
    const decoded = decodeEventLog({
      abi: PREDICTION_MARKET_ABI,
      data: log.data,
      topics: log.topics,
    }) as { args: OrderFilledEvent };

    const eventData = {
      eventType: 'OrderFilled',
      orderId: decoded.args.orderId.toString(),
      predictor: decoded.args.maker,
      counterparty: decoded.args.taker,
      predictorCollateral: decoded.args.makerCollateral.toString(),
      counterpartyCollateral: decoded.args.takerCollateral.toString(),
      refCode: decoded.args.refCode,
      blockNumber: Number(log.blockNumber),
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
      timestamp: Number(block.timestamp),
    };

    // Skip duplicates
    const orderFilledKey = {
      transactionHash: log.transactionHash || '',
      blockNumber: Number(log.blockNumber || 0),
      logIndex: log.logIndex || 0,
    } as const;

    const existingOrderFilled = await prisma.event.findFirst({
      where: {
        transactionHash: orderFilledKey.transactionHash,
        blockNumber: orderFilledKey.blockNumber,
        logIndex: orderFilledKey.logIndex,
      },
    });

    if (existingOrderFilled) {
      console.log(
        `[PredictionMarketIndexer] Skipping duplicate OrderFilled event tx=${orderFilledKey.transactionHash} block=${orderFilledKey.blockNumber} logIndex=${orderFilledKey.logIndex}`
      );
      return;
    }

    const order = await prisma.limitOrder.findUnique({
      where: {
        chainId_marketAddress_orderId: {
          chainId: ctx.chainId,
          marketAddress: log.address.toLowerCase(),
          orderId: eventData.orderId,
        },
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

      if (order) {
        await tx.limitOrder.update({
          where: { id: order.id },
          data: {
            status: 'filled',
            counterparty: eventData.counterparty.toLowerCase(),
            filledAt: Number(block.timestamp),
            filledTxHash: log.transactionHash || '',
          },
        });
      } else {
        console.warn(
          `[PredictionMarketIndexer] OrderFilled but no matching LimitOrder found for orderId=${eventData.orderId}`
        );
      }
    });

    console.log(
      `[PredictionMarketIndexer] Processed OrderFilled: orderId=${eventData.orderId}, predictor=${eventData.predictor}, counterparty=${eventData.counterparty}`
    );
  } catch (error) {
    console.error(
      '[PredictionMarketIndexer] Error processing OrderFilled:',
      error
    );
    Sentry.captureException(error);
  }
}
