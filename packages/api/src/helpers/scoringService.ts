import prisma from '../db';
import {
  normalizePredictionToProbability,
  outcomeFromSettlement,
} from './predictionNormalization';

export async function upsertAttestationScoreFromAttestation(
  attestationId: number
) {
  const att = await prisma.attestation.findUnique({
    where: { id: attestationId },
  });
  if (!att) return;

  // Try to load market for bounds and, if already settled, outcome
  const market = await prisma.market.findFirst({
    where: {
      market_group: { address: att.marketAddress.toLowerCase() },
      marketId: parseInt(att.marketId, 16) || Number(att.marketId) || 0,
    },
  });

  const normalized = normalizePredictionToProbability(
    att.prediction,
    market ?? null
  );

  await prisma.attestationScore.upsert({
    where: { attestationId: att.id },
    create: {
      attestationId: att.id,
      attester: att.attester.toLowerCase(),
      marketAddress: att.marketAddress.toLowerCase(),
      marketId: att.marketId,
      questionId: att.questionId,
      madeAt: att.time,
      used: false,
      probabilityD18: normalized.probabilityD18,
      probabilityFloat: normalized.probabilityFloat,
    },
    update: {
      probabilityD18: normalized.probabilityD18,
      probabilityFloat: normalized.probabilityFloat,
    },
  });
}

export async function selectLatestPreEndForMarket(
  marketAddress: string,
  marketId: string
) {
  const market = await prisma.market.findFirst({
    where: {
      market_group: { address: marketAddress.toLowerCase() },
      marketId: parseInt(marketId, 16) || Number(marketId) || 0,
    },
    include: { market_group: true },
  });
  if (!market || market.endTimestamp == null) return;

  const end = market.endTimestamp;

  // Get unique attesters with pre-end forecasts for this market
  const distinctAttesters = await prisma.attestationScore.findMany({
    where: {
      marketAddress: marketAddress.toLowerCase(),
      marketId,
      madeAt: { lte: end },
    },
    select: { attester: true },
    distinct: ['attester'],
  });

  if (distinctAttesters.length === 0) return;

  // For each attester, select their latest pre-end attestation
  for (const { attester } of distinctAttesters) {
    const latest = await prisma.attestationScore.findFirst({
      where: {
        marketAddress: marketAddress.toLowerCase(),
        marketId,
        attester,
        madeAt: { lte: end },
      },
      orderBy: { madeAt: 'desc' },
    });

    if (!latest) continue;

    await prisma.$transaction([
      prisma.attestationScore.updateMany({
        where: {
          marketAddress: marketAddress.toLowerCase(),
          marketId,
          attester,
        },
        data: { used: false },
      }),
      prisma.attestationScore.update({
        where: { attestationId: latest.attestationId },
        data: { used: true },
      }),
    ]);
  }
}

export async function scoreSelectedForecastsForSettledMarket(
  marketAddress: string,
  marketId: string
) {
  const market = await prisma.market.findFirst({
    where: {
      market_group: { address: marketAddress.toLowerCase() },
      marketId: parseInt(marketId, 16) || Number(marketId) || 0,
    },
  });
  if (!market) return;

  const outcome = outcomeFromSettlement(market);
  if (outcome === null) return; // not binary or not settled

  const selected = await prisma.attestationScore.findMany({
    where: {
      marketAddress: marketAddress.toLowerCase(),
      marketId,
      used: true,
      scoredAt: null,
      probabilityFloat: { not: null },
    },
  });

  if (selected.length === 0) return;

  await prisma.$transaction(
    selected.flatMap((row) => {
      const p = row.probabilityFloat as number;
      const err = (p - outcome) * (p - outcome);
      return [
        prisma.attestationScore.update({
          where: { attestationId: row.attestationId },
          data: { errorSquared: err, scoredAt: new Date(), outcome },
        }),
        prisma.forecasterScore.upsert({
          where: { attester: row.attester },
          update: {
            numScored: { increment: 1 },
            sumErrorSquared: { increment: err },
            meanBrier: { set: 0 }, // set later via compute
            updatedAt: new Date(),
          },
          create: {
            attester: row.attester,
            numScored: 1,
            sumErrorSquared: err,
            meanBrier: err,
          },
        }),
      ];
    })
  );

  // Recompute meanBrier in a second pass to avoid drift
  const attesters = Array.from(new Set(selected.map((r) => r.attester)));
  await Promise.all(
    attesters.map(async (a) => {
      const fs = await prisma.forecasterScore.findUnique({
        where: { attester: a },
      });
      if (!fs || fs.numScored <= 0) return;
      const mean = fs.sumErrorSquared / fs.numScored;
      await prisma.forecasterScore.update({
        where: { attester: a },
        data: { meanBrier: mean, updatedAt: new Date() },
      });
    })
  );
}

export async function getTopForecasters(limit = 10) {
  return prisma.forecasterScore.findMany({
    orderBy: { timeWeightedMeanBrier: 'asc' },
    take: limit,
  });
}

// Time-weighted Brier: compute per-attester per-market and update aggregates idempotently
async function computeTimeWeightedForAttesterMarket(
  marketAddress: string,
  marketId: string,
  attester: string
) {
  const market = await prisma.market.findFirst({
    where: {
      market_group: { address: marketAddress.toLowerCase() },
      marketId: parseInt(marketId, 16) || Number(marketId) || 0,
    },
  });
  if (!market || market.endTimestamp == null || market.startTimestamp == null)
    return;
  const outcome = outcomeFromSettlement(market);
  if (outcome === null) return;

  const rows = await prisma.attestationScore.findMany({
    where: {
      marketAddress: marketAddress.toLowerCase(),
      marketId,
      attester,
      madeAt: { lte: market.endTimestamp },
      probabilityFloat: { not: null },
    },
    orderBy: { madeAt: 'asc' },
  });
  if (rows.length === 0) return;

  // Build intervals from each forecast to next or end
  const start = Math.max(rows[0].madeAt, market.startTimestamp);
  const end = market.endTimestamp;
  if (end <= start) return;

  let weightedSum = 0;
  let totalDuration = 0;
  for (let i = 0; i < rows.length; i++) {
    const p = rows[i].probabilityFloat as number;
    const t0 = i === 0 ? start : Math.max(rows[i].madeAt, start);
    const t1 = i < rows.length - 1 ? Math.min(rows[i + 1].madeAt, end) : end;
    const duration = Math.max(0, t1 - t0);
    if (duration <= 0) continue;
    const err = (p - outcome) * (p - outcome);
    weightedSum += err * duration;
    totalDuration += duration;
  }

  if (totalDuration <= 0) return;
  const twError = weightedSum / totalDuration;

  await prisma.attesterMarketScore.upsert({
    where: {
      attester_marketAddress_marketId: {
        attester,
        marketAddress: marketAddress.toLowerCase(),
        marketId,
      },
    },
    update: { timeWeightedError: twError, scoredAt: new Date() },
    create: {
      attester,
      marketAddress: marketAddress.toLowerCase(),
      marketId,
      timeWeightedError: twError,
      scoredAt: new Date(),
    },
  });
}

async function recomputeForecasterTimeWeightedAggregate(attester: string) {
  const rows = await prisma.attesterMarketScore.findMany({
    where: { attester },
  });
  const count = rows.length;
  const sum = rows.reduce((acc, r) => acc + r.timeWeightedError, 0);
  const mean = count > 0 ? sum / count : 0;
  await prisma.forecasterScore.upsert({
    where: { attester },
    update: {
      numTimeWeighted: count,
      sumTimeWeightedError: sum,
      timeWeightedMeanBrier: mean,
      updatedAt: new Date(),
    },
    create: {
      attester,
      numScored: 0,
      sumErrorSquared: 0,
      meanBrier: 0,
      numTimeWeighted: count,
      sumTimeWeightedError: sum,
      timeWeightedMeanBrier: mean,
    },
  });
}

export async function scoreTimeWeightedForSettledMarket(
  marketAddress: string,
  marketId: string
) {
  const market = await prisma.market.findFirst({
    where: {
      market_group: { address: marketAddress.toLowerCase() },
      marketId: parseInt(marketId, 16) || Number(marketId) || 0,
    },
  });
  if (!market || !market.settled) return;

  // All attesters who made a pre-end forecast in this market
  const attesters = await prisma.attestationScore.findMany({
    where: {
      marketAddress: marketAddress.toLowerCase(),
      marketId,
      madeAt: { lte: market.endTimestamp ?? 0 },
      probabilityFloat: { not: null },
    },
    distinct: ['attester'],
    select: { attester: true },
  });
  if (attesters.length === 0) return;

  for (const { attester } of attesters) {
    await computeTimeWeightedForAttesterMarket(
      marketAddress,
      marketId,
      attester
    );
    await recomputeForecasterTimeWeightedAggregate(attester);
  }
}
