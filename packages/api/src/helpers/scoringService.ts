import prisma from '../db';
import {
  normalizePredictionToProbability,
  outcomeFromCondition,
} from './predictionNormalization';

export async function upsertAttestationScoreFromAttestation(
  attestationId: number
) {
  const att = await prisma.attestation.findUnique({
    where: { id: attestationId },
  });
  if (!att) return;

  const normalized = normalizePredictionToProbability(att.prediction);

  await prisma.attestationScore.upsert({
    where: { attestationId: att.id },
    create: {
      attestationId: att.id,
      attester: att.attester.toLowerCase(),
      marketAddress: att.marketAddress?.toLowerCase() ?? null,
      marketId: att.marketId ?? null,
      resolver: att.resolver,
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
  // Find the condition by questionId (marketId in attestation maps to condition ID)
  const condition = await prisma.condition.findUnique({
    where: { id: marketId },
  });
  if (!condition || condition.endTime == null) return;

  const end = condition.endTime;

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
  // Find the condition by ID (marketId in attestation maps to condition ID)
  const condition = await prisma.condition.findUnique({
    where: { id: marketId },
  });
  if (!condition) return;

  const outcome = outcomeFromCondition(condition);
  if (outcome === null) {
    // Not settled yet: clear any stale scores
    await prisma.attestationScore.updateMany({
      where: {
        marketAddress: marketAddress.toLowerCase(),
        marketId,
      },
      data: { errorSquared: null, scoredAt: null, outcome: null },
    });
    return;
  }

  // Score all pre-end forecasts
  const end = condition.endTime ?? null;
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

// Horizon-weighted error (formerly HWBS): compute per-attester per-market (pure compute, no writes)
export async function computeTimeWeightedForAttesterMarketValue(
  marketAddress: string,
  marketId: string,
  attester: string
): Promise<number | null> {
  const condition = await prisma.condition.findUnique({
    where: { id: marketId },
  });
  if (!condition || condition.endTime == null) return null;
  const outcome = outcomeFromCondition(condition);
  if (outcome === null) return null;

  const rows = await prisma.attestationScore.findMany({
    where: {
      marketAddress: marketAddress.toLowerCase(),
      marketId,
      attester,
      madeAt: { lte: condition.endTime },
      probabilityFloat: { not: null },
    },
    orderBy: { madeAt: 'asc' },
  });
  if (rows.length === 0) return null;

  // Build intervals from each forecast to next or end
  const start = rows[0].madeAt;
  const end = condition.endTime;
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

// Batched horizon-weighted error across all markets for a single attester
export async function computeTimeWeightedForAttesterSummary(
  attester: string
): Promise<{ sumTimeWeightedError: number; numTimeWeighted: number }> {
  const a = attester.toLowerCase();

  // 1) Distinct markets the attester forecasted on
  const distinctMarkets = await prisma.attestationScore.findMany({
    where: { attester: a },
    distinct: ['marketAddress', 'marketId'],
    select: { marketAddress: true, marketId: true },
  });
  if (distinctMarkets.length === 0)
    return { sumTimeWeightedError: 0, numTimeWeighted: 0 };

  const conditionIds = [
    ...new Set(
      distinctMarkets.map((m) => m.marketId).filter((id): id is string => !!id)
    ),
  ];

  // 2) Fetch condition metadata needed for outcome and end time in ONE query
  const conditions = await prisma.condition.findMany({
    where: {
      id: { in: conditionIds },
    },
    select: {
      id: true,
      endTime: true,
      settled: true,
      resolvedToYes: true,
    },
  });

  type MarketKey = string;
  const key = (marketId: string): MarketKey => marketId;

  const meta = new Map<
    MarketKey,
    {
      end: number | null;
      outcome: 0 | 1 | null;
    }
  >();

  for (const c of conditions) {
    const outcome = outcomeFromCondition(c);
    meta.set(key(c.id), { end: c.endTime ?? null, outcome });
  }

  // 3) Fetch all forecasts by this attester across those markets in ONE query
  const rows = await prisma.attestationScore.findMany({
    where: {
      attester: a,
      probabilityFloat: { not: null },
    },
    orderBy: { madeAt: 'asc' },
    select: {
      marketAddress: true,
      marketId: true,
      madeAt: true,
      probabilityFloat: true,
    },
  });

  // 4) Group rows by market and compute time-weighted error per market
  const byMarket = new Map<MarketKey, { madeAt: number; p: number }[]>();
  for (const r of rows) {
    if (!r.marketId) continue;
    const k = key(r.marketId);
    const m = meta.get(k);
    if (!m || m.end == null || m.outcome == null) continue;
    if (r.madeAt > m.end) continue;
    const p = r.probabilityFloat as number;
    if (!Number.isFinite(p)) continue;
    if (!byMarket.has(k)) byMarket.set(k, []);
    byMarket.get(k)!.push({ madeAt: r.madeAt, p });
  }

  const alphaEnv = process.env.HWBS_ALPHA;
  const alpha =
    Number.isFinite(Number(alphaEnv)) && Number(alphaEnv) > 0
      ? Number(alphaEnv)
      : 2;

  let sumTimeWeightedError = 0;
  let numTimeWeighted = 0;

  for (const [k, seq] of byMarket.entries()) {
    const m = meta.get(k)!;
    if (seq.length === 0) continue;
    const rowsAsc = seq.sort((a, b) => a.madeAt - b.madeAt);
    const start = rowsAsc[0].madeAt;
    const end = m.end as number;
    if (end <= start) continue;
    let weightedSum = 0;
    let totalWeight = 0;
    for (let i = 0; i < rowsAsc.length; i++) {
      const p = rowsAsc[i].p;
      const t0 = i === 0 ? start : Math.max(rowsAsc[i].madeAt, start);
      const t1 =
        i < rowsAsc.length - 1 ? Math.min(rowsAsc[i + 1].madeAt, end) : end;
      const duration = Math.max(0, t1 - t0);
      if (duration <= 0) continue;
      const err = (p - (m.outcome as number)) * (p - (m.outcome as number));
      const midpoint = (t0 + t1) / 2;
      const tau = Math.max(0, end - midpoint);
      const weight = duration * Math.pow(tau, alpha);
      weightedSum += err * weight;
      totalWeight += weight;
    }
    if (totalWeight > 0) {
      sumTimeWeightedError += weightedSum / totalWeight;
      numTimeWeighted += 1;
    }
  }

  return { sumTimeWeightedError, numTimeWeighted };
}

// Batched horizon-weighted error across all markets for multiple attesters
// Returns a map of attester -> { sumTimeWeightedError, numTimeWeighted }
export async function computeTimeWeightedForAttestersSummary(
  attesters: string[]
): Promise<
  Map<string, { sumTimeWeightedError: number; numTimeWeighted: number }>
> {
  const normalized = attesters.map((x) => x.toLowerCase());
  if (normalized.length === 0)
    return new Map<
      string,
      { sumTimeWeightedError: number; numTimeWeighted: number }
    >();

  // 1) Distinct market combos across all attesters in one query
  const distinctMarkets = await prisma.attestationScore.findMany({
    where: { attester: { in: normalized } },
    distinct: ['marketAddress', 'marketId'],
    select: { marketAddress: true, marketId: true },
  });

  if (distinctMarkets.length === 0)
    return new Map<
      string,
      { sumTimeWeightedError: number; numTimeWeighted: number }
    >();

  const conditionIds = [
    ...new Set(
      distinctMarkets.map((m) => m.marketId).filter((id): id is string => !!id)
    ),
  ];

  // 2) Condition metadata for those IDs
  const conditions = await prisma.condition.findMany({
    where: {
      id: { in: conditionIds },
    },
    select: {
      id: true,
      endTime: true,
      settled: true,
      resolvedToYes: true,
    },
  });

  type MarketKey = string;
  const key = (marketId: string): MarketKey => marketId;

  const meta = new Map<
    MarketKey,
    {
      end: number | null;
      outcome: 0 | 1 | null;
    }
  >();

  for (const c of conditions) {
    const outcome = outcomeFromCondition(c);
    meta.set(key(c.id), { end: c.endTime ?? null, outcome });
  }

  // 3) All forecasts for these attesters across those markets
  const rows = await prisma.attestationScore.findMany({
    where: {
      attester: { in: normalized },
      probabilityFloat: { not: null },
    },
    orderBy: { madeAt: 'asc' },
    select: {
      attester: true,
      marketAddress: true,
      marketId: true,
      madeAt: true,
      probabilityFloat: true,
    },
  });

  const alphaEnv = process.env.HWBS_ALPHA;
  const alpha =
    Number.isFinite(Number(alphaEnv)) && Number(alphaEnv) > 0
      ? Number(alphaEnv)
      : 2;

  const byAttester = new Map<string, { sum: number; n: number }>();

  // Group and compute per (attester, market)
  type GroupKey = string;
  const gk = (att: string, marketId: string): GroupKey => `${att}::${marketId}`;
  const groups = new Map<
    GroupKey,
    {
      att: string;
      end: number;
      outcome: 0 | 1;
      seq: { t: number; p: number }[];
    }
  >();

  for (const r of rows) {
    if (!r.marketAddress || !r.marketId) continue;
    const att = (r.attester || '').toLowerCase();
    const k = key(r.marketId);
    const m = meta.get(k);
    if (!m || m.end == null || m.outcome == null) continue;
    const gg = gk(att, r.marketId);
    if (!groups.has(gg))
      groups.set(gg, {
        att,
        end: m.end as number,
        outcome: m.outcome as 0 | 1,
        seq: [],
      });
    const p = r.probabilityFloat as number;
    if (!Number.isFinite(p)) continue;
    groups.get(gg)!.seq.push({ t: r.madeAt, p });
  }

  for (const value of groups.values()) {
    if (value.seq.length === 0) continue;
    const seq = value.seq.sort((a, b) => a.t - b.t);
    const start = seq[0].t;
    const end = value.end;
    if (end <= start) continue;
    let weightedSum = 0;
    let totalWeight = 0;
    for (let i = 0; i < seq.length; i++) {
      const p = seq[i].p;
      const t0 = i === 0 ? start : Math.max(seq[i].t, start);
      const t1 = i < seq.length - 1 ? Math.min(seq[i + 1].t, end) : end;
      const duration = Math.max(0, t1 - t0);
      if (duration <= 0) continue;
      const err = (p - value.outcome) * (p - value.outcome);
      const midpoint = (t0 + t1) / 2;
      const tau = Math.max(0, end - midpoint);
      const weight = duration * Math.pow(tau, alpha);
      weightedSum += err * weight;
      totalWeight += weight;
    }
    if (totalWeight > 0) {
      const twError = weightedSum / totalWeight;
      const prev = byAttester.get(value.att) || { sum: 0, n: 0 };
      byAttester.set(value.att, { sum: prev.sum + twError, n: prev.n + 1 });
    }
  }

  const result = new Map<
    string,
    { sumTimeWeightedError: number; numTimeWeighted: number }
  >();
  for (const [att, agg] of byAttester.entries()) {
    result.set(att, { sumTimeWeightedError: agg.sum, numTimeWeighted: agg.n });
  }
  // Ensure every requested attester appears (even if zero)
  for (const att of normalized) {
    if (!result.has(att))
      result.set(att, { sumTimeWeightedError: 0, numTimeWeighted: 0 });
  }
  return result;
}
