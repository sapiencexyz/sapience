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
import { sendPositionAlert } from '../../../../helpers/discordAlert';
import { PREDICTION_MARKET_ABI } from '../constants';
import type { PredictionMintedEvent } from '../types';
import type { HandlerContext } from '../handlerContext';
import { buildPythLegDescriptor, resolvePythSyntheticQuestion } from '../utils';

export async function processPredictionMinted(
  ctx: HandlerContext,
  log: Log,
  block: Block
): Promise<void> {
  try {
    const decodedAny = decodeEventLog({
      abi: PREDICTION_MARKET_ABI,
      data: log.data,
      topics: log.topics,
    }) as { args: PredictionMintedEvent };

    const eventData = {
      eventType: 'PredictionMinted',
      maker: decodedAny.args.maker,
      taker: decodedAny.args.taker,
      makerNftTokenId: decodedAny.args.makerNftTokenId.toString(),
      takerNftTokenId: decodedAny.args.takerNftTokenId.toString(),
      makerCollateral: decodedAny.args.makerCollateral.toString(),
      takerCollateral: decodedAny.args.takerCollateral.toString(),
      totalCollateral: decodedAny.args.totalCollateral.toString(),
      refCode: decodedAny.args.refCode,
      blockNumber: Number(log.blockNumber),
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
      timestamp: Number(block.timestamp),
    };

    const encodedPredictedOutcomes = decodedAny.args
      .encodedPredictedOutcomes as `0x${string}`;

    let predictedOutcomes: Array<{
      conditionId: string;
      prediction: boolean;
    }> = [];

    // Compute endsAt from decoded leg(s)
    let endsAt: number | null = null;

    // Decode outcomes.
    // - UMA resolver uses: tuple[](bytes32 marketId, bool prediction)
    // - Pyth resolver uses: tuple[](bytes32 priceId, uint64 endTime, int64 strikePrice, int32 strikeExpo, bool overWinsOnTie, bool prediction)
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
        conditionId: String(marketId).toLowerCase(),
        prediction,
      }));

      // UMA-style endsAt: compute from existing Condition.endTime values
      try {
        const conditionIds = predictedOutcomes.map((o) => o.conditionId);
        const matched = await prisma.condition.findMany({
          where: { id: { in: conditionIds } },
          select: { id: true, endTime: true },
        });
        if (matched.length > 0) {
          endsAt = matched.reduce(
            (max, c) => (c.endTime > max ? c.endTime : max),
            matched[0].endTime
          );
        }
      } catch (e) {
        console.warn(
          '[PredictionMarketIndexer] Failed computing endsAt from conditions:',
          e
        );
      }
    } catch {
      // Pyth-style: compute marketId and endsAt directly from tuple contents.
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
        conditionId: String(l.marketId).toLowerCase(),
        prediction: l.prediction,
      }));

      endsAt =
        legs.length > 0
          ? legs.reduce(
              (max, l) => (l.endTimeSec > max ? l.endTimeSec : max),
              legs[0].endTimeSec
            )
          : null;

      // Ensure referenced Conditions exist so Prediction rows can be created (FK constraint).
      // These are synthetic placeholders for Pyth markets; keep them non-public so they
      // don't pollute the "Markets" list.
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
        // This is safe because it's sourced from the same encoded payload.
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
            // Keep endTime aligned (should be stable)
            endTime: endTimeInt,
            // Keep question aligned so historical rows can be upgraded from the old placeholder.
            question: q,
            description: `${pythDescriptor}\nSynthetic Pyth market (generated by predictionMarketIndexer)`,
            chainId: ctx.chainId,
          },
        });
      }
    }

    const conditionIds = predictedOutcomes.map((o) => o.conditionId);

    // Skip if this event already exists (avoid double-writing event and transaction)
    const uniqueEventKey = {
      transactionHash: log.transactionHash || '',
      blockNumber: Number(log.blockNumber || 0),
      logIndex: log.logIndex || 0,
    } as const;

    const existingEvent = await prisma.event.findFirst({
      where: {
        transactionHash: uniqueEventKey.transactionHash,
        blockNumber: uniqueEventKey.blockNumber,
        logIndex: uniqueEventKey.logIndex,
      },
    });

    if (existingEvent) {
      console.log(
        `[PredictionMarketIndexer] Event already exists tx=${uniqueEventKey.transactionHash} block=${uniqueEventKey.blockNumber} logIndex=${uniqueEventKey.logIndex}`
      );

      // For reindexing: still check if position needs to be created (might be missing due to old bug)
      const existingPosition = await prisma.legacyPosition.findFirst({
        where: {
          chainId: ctx.chainId,
          marketAddress: log.address.toLowerCase(),
          predictorNftTokenId: eventData.makerNftTokenId,
          counterpartyNftTokenId: eventData.takerNftTokenId,
        },
      });

      if (existingPosition) {
        console.log(
          `[PredictionMarketIndexer] Position already exists for NFTs ${eventData.makerNftTokenId}/${eventData.takerNftTokenId}`
        );
        return;
      } else {
        console.log(
          `[PredictionMarketIndexer] Event exists but position missing - creating position for NFTs ${eventData.makerNftTokenId}/${eventData.takerNftTokenId}`
        );
        // Recovery: create position in its own transaction
        const predictionLegsData = predictedOutcomes.map((outcome) => ({
          conditionId: outcome.conditionId,
          outcomeYes: outcome.prediction,
          chainId: ctx.chainId,
        }));

        await prisma.$transaction(async (tx) => {
          await tx.legacyPosition.create({
            data: {
              chainId: ctx.chainId,
              marketAddress: log.address.toLowerCase(),
              predictor: eventData.maker.toLowerCase(),
              counterparty: eventData.taker.toLowerCase(),
              predictorNftTokenId: eventData.makerNftTokenId,
              counterpartyNftTokenId: eventData.takerNftTokenId,
              totalCollateral: eventData.totalCollateral,
              predictorCollateral: eventData.makerCollateral,
              counterpartyCollateral: eventData.takerCollateral,
              refCode: eventData.refCode,
              status: 'active',
              predictorWon: null,
              mintedAt: Number(block.timestamp),
              settledAt: null,
              endsAt: endsAt ?? null,
              predictions: {
                create: predictionLegsData,
              },
            },
          });
        });

        console.log(
          `[PredictionMarketIndexer] Processed PredictionMinted (recovery): ${eventData.makerNftTokenId}, ${eventData.takerNftTokenId}`
        );
        return;
      }
    } else {
      // Store new event and create position atomically
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

        await tx.legacyPosition.create({
          data: {
            chainId: ctx.chainId,
            marketAddress: log.address.toLowerCase(),
            predictor: eventData.maker.toLowerCase(),
            counterparty: eventData.taker.toLowerCase(),
            predictorNftTokenId: eventData.makerNftTokenId,
            counterpartyNftTokenId: eventData.takerNftTokenId,
            totalCollateral: eventData.totalCollateral,
            predictorCollateral: eventData.makerCollateral,
            counterpartyCollateral: eventData.takerCollateral,
            refCode: eventData.refCode,
            status: 'active',
            predictorWon: null,
            mintedAt: Number(block.timestamp),
            settledAt: null,
            endsAt: endsAt ?? null,
            predictions: {
              create: predictionLegsData,
            },
          },
        });

        // Update open interest for all conditions in this position
        const collateralStr = eventData.totalCollateral;
        for (const conditionId of conditionIds) {
          await tx.$executeRaw`
            UPDATE condition 
            SET "openInterest" = (COALESCE("openInterest"::NUMERIC, 0) + ${collateralStr}::NUMERIC)::TEXT
            WHERE id = ${conditionId}
          `;
        }
      });
    }

    // Send Discord alert — fire-and-forget, deliberately NOT awaited.
    void (async () => {
      try {
        const conditions = await prisma.condition.findMany({
          where: { id: { in: conditionIds } },
          select: { id: true, question: true },
        });
        const questionMap = new Map(conditions.map((c) => [c.id, c.question]));

        sendPositionAlert({
          predictor: eventData.maker,
          counterparty: eventData.taker,
          predictorCollateral: eventData.makerCollateral,
          counterpartyCollateral: eventData.takerCollateral,
          totalCollateral: eventData.totalCollateral,
          predictions: predictedOutcomes.map((o) => ({
            conditionId: o.conditionId,
            question: questionMap.get(o.conditionId) ?? o.conditionId,
            outcomeYes: o.prediction,
          })),
          blockTimestamp: Number(block.timestamp),
          transactionHash: log.transactionHash || '',
          chainId: ctx.chainId,
          nftId: String(eventData.makerNftTokenId),
          marketAddress: log.address.toLowerCase(),
        });
      } catch (e) {
        console.error('[PredictionMarketIndexer] Discord alert failed:', e);
      }
    })();

    console.log(
      `[PredictionMarketIndexer] Processed PredictionMinted: ${eventData.makerNftTokenId}, ${eventData.takerNftTokenId}`
    );
  } catch (error) {
    console.error(
      '[PredictionMarketIndexer] Error processing PredictionMinted:',
      error
    );
    Sentry.captureException(error);
  }
}
