import prisma from '../../../../db';
import {
  decodeEventLog,
  decodeAbiParameters,
  encodeAbiParameters,
  keccak256,
  type Log,
  type Block,
} from 'viem';
import Sentry from '../../../../instrument';
import { PREDICTION_MARKET_ABI } from '../constants';
import type { OrderPlacedEvent } from '../types';
import type { HandlerContext } from '../handlerContext';
import { buildPythLegDescriptor, resolvePythSyntheticQuestion } from '../utils';

export async function processOrderPlaced(
  ctx: HandlerContext,
  log: Log,
  block: Block
): Promise<void> {
  try {
    const decoded = decodeEventLog({
      abi: PREDICTION_MARKET_ABI,
      data: log.data,
      topics: log.topics,
    }) as { args: OrderPlacedEvent };

    const eventData = {
      eventType: 'OrderPlaced',
      predictor: decoded.args.maker,
      orderId: decoded.args.orderId.toString(),
      resolver: decoded.args.resolver,
      predictorCollateral: decoded.args.makerCollateral.toString(),
      counterpartyCollateral: decoded.args.takerCollateral.toString(),
      refCode: decoded.args.refCode,
      blockNumber: Number(log.blockNumber),
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
      timestamp: Number(block.timestamp),
    };

    const orderPlacedKey = {
      transactionHash: log.transactionHash || '',
      blockNumber: Number(log.blockNumber || 0),
      logIndex: log.logIndex || 0,
    } as const;

    const existingOrderPlaced = await prisma.event.findFirst({
      where: {
        transactionHash: orderPlacedKey.transactionHash,
        blockNumber: orderPlacedKey.blockNumber,
        logIndex: orderPlacedKey.logIndex,
      },
    });

    if (existingOrderPlaced) {
      console.log(
        `[PredictionMarketIndexer] Skipping duplicate OrderPlaced event tx=${orderPlacedKey.transactionHash} block=${orderPlacedKey.blockNumber} logIndex=${orderPlacedKey.logIndex}`
      );
      return;
    }

    const encodedPredictedOutcomes = decoded.args
      .encodedPredictedOutcomes as `0x${string}`;

    let predictedOutcomes: Array<{
      conditionId: `0x${string}`;
      prediction: boolean;
    }> = [];

    try {
      const [outcomes] = decodeAbiParameters(
        [
          {
            type: 'tuple[]',
            components: [{ type: 'bytes32' }, { type: 'bool' }],
          },
        ],
        encodedPredictedOutcomes
      ) as unknown as [[`0x${string}`, boolean][]];
      predictedOutcomes = outcomes.map(([marketId, prediction]) => ({
        conditionId: String(marketId).toLowerCase() as `0x${string}`,
        prediction,
      }));
    } catch {
      const [outcomes] = decodeAbiParameters(
        [
          {
            type: 'tuple[]',
            components: [
              { type: 'bytes32' }, // priceId
              { type: 'uint64' }, // endTime
              { type: 'int64' }, // strikePrice
              { type: 'int32' }, // strikeExpo
              { type: 'bool' }, // overWinsOnTie
              { type: 'bool' }, // prediction
            ],
          },
        ],
        encodedPredictedOutcomes
      ) as unknown as [
        Array<[`0x${string}`, bigint, bigint, bigint, boolean, boolean]>,
      ];

      const legs = outcomes.map(
        ([priceId, endTime, strikePrice, strikeExpo, overWinsOnTie, pred]) => {
          const strikeExpoNum = Number(strikeExpo);
          const marketId = keccak256(
            encodeAbiParameters(
              [
                { type: 'bytes32' },
                { type: 'uint64' },
                { type: 'int64' },
                { type: 'int32' },
                { type: 'bool' },
              ],
              [priceId, endTime, strikePrice, strikeExpoNum, overWinsOnTie]
            )
          );
          return {
            marketId,
            priceId,
            endTimeSec: Number(endTime),
            prediction: !!pred,
          };
        }
      );

      predictedOutcomes = legs.map((l) => ({
        conditionId: String(l.marketId).toLowerCase() as `0x${string}`,
        prediction: l.prediction,
      }));

      // Ensure referenced Conditions exist so Prediction rows can be created (FK constraint).
      const pythQuestionByPriceId = new Map<string, string>();
      for (const l of legs) {
        const id = String(l.marketId).toLowerCase();
        const endTimeInt =
          Number.isFinite(l.endTimeSec) && l.endTimeSec > 0
            ? Math.floor(l.endTimeSec)
            : null;
        if (!endTimeInt) continue;
        const priceIdLower = String(l.priceId).toLowerCase();
        const q =
          pythQuestionByPriceId.get(priceIdLower) ??
          (await resolvePythSyntheticQuestion(String(l.priceId)));
        pythQuestionByPriceId.set(priceIdLower, q);

        // Re-decode the full leg tuple so we can persist strike info for UI rendering.
        const match = outcomes.find(
          (o) => String(o[0]).toLowerCase() === priceIdLower
        );
        const strikePrice = match ? (match[2] as bigint) : 0n;
        const strikeExpoNum = match ? Number(match[3] as bigint) : 0;
        const overWinsOnTie = match ? Boolean(match[4] as boolean) : true;
        const pythDescriptor = buildPythLegDescriptor({
          priceId: String(l.priceId),
          endTimeSec: l.endTimeSec,
          strikePrice,
          strikeExpo: strikeExpoNum,
          overWinsOnTie,
        });

        await prisma.condition.upsert({
          where: { id },
          create: {
            id,
            question: q,
            shortName: null,
            categoryId: null,
            endTime: endTimeInt,
            public: false,
            claimStatement: `PYTH:${String(l.priceId).toLowerCase()}`,
            description: `${pythDescriptor}\nSynthetic Pyth market (generated by predictionMarketIndexer)`,
            similarMarkets: [],
            chainId: ctx.chainId,
          },
          update: {
            endTime: endTimeInt,
            // Keep question aligned so historical rows can be upgraded from the old placeholder.
            question: q,
            description: `${pythDescriptor}\nSynthetic Pyth market (generated by predictionMarketIndexer)`,
            chainId: ctx.chainId,
          },
        });
      }
    }

    const predictionLegsData = predictedOutcomes.map((outcome) => ({
      conditionId: outcome.conditionId,
      outcomeYes: outcome.prediction,
      chainId: ctx.chainId,
    }));

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

      await tx.limitOrder.upsert({
        where: {
          chainId_marketAddress_orderId: {
            chainId: ctx.chainId,
            marketAddress: log.address.toLowerCase(),
            orderId: eventData.orderId,
          },
        },
        create: {
          chainId: ctx.chainId,
          marketAddress: log.address.toLowerCase(),
          orderId: eventData.orderId,
          predictor: eventData.predictor.toLowerCase(),
          resolver: eventData.resolver.toLowerCase(),
          predictorCollateral: eventData.predictorCollateral,
          counterpartyCollateral: eventData.counterpartyCollateral,
          refCode: eventData.refCode,
          status: 'pending',
          placedAt: Number(block.timestamp),
          placedTxHash: log.transactionHash || '',
          predictions: {
            create: predictionLegsData,
          },
        },
        update: {
          predictor: eventData.predictor.toLowerCase(),
          resolver: eventData.resolver.toLowerCase(),
          predictorCollateral: eventData.predictorCollateral,
          counterpartyCollateral: eventData.counterpartyCollateral,
          refCode: eventData.refCode,
          placedAt: Number(block.timestamp),
          placedTxHash: log.transactionHash || '',
          predictions: {
            deleteMany: {},
            create: predictionLegsData,
          },
        },
      });
    });

    console.log(
      `[PredictionMarketIndexer] Processed OrderPlaced: orderId=${eventData.orderId}, predictor=${eventData.predictor}`
    );
  } catch (error) {
    console.error(
      '[PredictionMarketIndexer] Error processing OrderPlaced:',
      error
    );
    Sentry.captureException(error);
  }
}
