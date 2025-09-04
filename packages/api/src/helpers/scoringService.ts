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
  if (outcome === null) {
    // Non-binary market or not strictly settled at bounds: clear any stale scores
    await prisma.attestationScore.updateMany({
      where: {
        marketAddress: marketAddress.toLowerCase(),
        marketId,
      },
      data: { errorSquared: null, scoredAt: null, outcome: null },
    });
    return;
  }

  // Score all pre-end forecasts (not just a selected/latest one)
  const end = market.endTimestamp ?? null;
  if (end == null) return;

  const selected = await prisma.attestationScore.findMany({
    where: {
      marketAddress: marketAddress.toLowerCase(),
      marketId,
      madeAt: { lte: end },
      probabilityFloat: { not: null },
    },
    select: { attestationId: true, probabilityFloat: true },
  });

  if (selected.length === 0) return;

  await prisma.$transaction(
    selected.map(
      (row: { attestationId: number; probabilityFloat: number | null }) => {
        const p = row.probabilityFloat as number;
        const err = (p - outcome) * (p - outcome);
        return prisma.attestationScore.update({
          where: { attestationId: row.attestationId },
          data: { errorSquared: err, scoredAt: new Date(), outcome },
        });
      }
    )
  );
}

// Horizon-weighted Brier (HWBS): compute per-attester per-market (pure compute, no writes)
export async function computeTimeWeightedForAttesterMarketValue(
  marketAddress: string,
  marketId: string,
  attester: string
): Promise<number | null> {
  const market = await prisma.market.findFirst({
    where: {
      market_group: { address: marketAddress.toLowerCase() },
      marketId: parseInt(marketId, 16) || Number(marketId) || 0,
    },
  });
  if (!market || market.endTimestamp == null) return null;
  const outcome = outcomeFromSettlement(market);
  if (outcome === null) return null;

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
  if (rows.length === 0) return null;

  // Build intervals from each forecast to next or end
  const start = rows[0].madeAt;
  const end = market.endTimestamp;
  if (end <= start) return null;

  const alphaEnv = process.env.HWBS_ALPHA;
  const alpha =
    Number.isFinite(Number(alphaEnv)) && Number(alphaEnv) > 0
      ? Number(alphaEnv)
      : 2;

  let weightedSum = 0;
  let totalWeight = 0;
  for (let i = 0; i < rows.length; i++) {
    const p = rows[i].probabilityFloat as number;
    const t0 = i === 0 ? start : Math.max(rows[i].madeAt, start);
    const t1 = i < rows.length - 1 ? Math.min(rows[i + 1].madeAt, end) : end;
    const duration = Math.max(0, t1 - t0);
    if (duration <= 0) continue;
    const err = (p - outcome) * (p - outcome);
    const midpoint = (t0 + t1) / 2;
    const tau = Math.max(0, end - midpoint);
    const weight = duration * Math.pow(tau, alpha);
    weightedSum += err * weight;
    totalWeight += weight;
  }

  if (totalWeight <= 0) return null;
  const twError = weightedSum / totalWeight;
  return twError;
}
