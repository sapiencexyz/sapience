import { OutcomeSide } from '@sapience/sdk/types/escrow';
import type { PickJson } from '@sapience/sdk/types/escrow';

export interface ConditionInfo {
  id: string;
  resolver: string;
  question?: string;
  estimatedPrice?: number | null;
  similarMarkets?: unknown;
}

export interface EnrichedPick {
  conditionResolver: string;
  conditionId: string;
  predictedOutcome: number;
  question?: string;
  estimatedPrice?: number | null;
  polymarketUrl?: string | null;
}

interface ConditionFields {
  id: string;
  resolver: string;
  settled?: boolean;
  question?: string;
  estimatedPrice?: number | null;
  similarMarkets?: unknown;
}

function extractPolymarketUrl(similarMarkets: unknown): string | null {
  if (!similarMarkets) return null;
  let markets: unknown[];
  if (typeof similarMarkets === 'string') {
    try { markets = JSON.parse(similarMarkets); } catch { return null; }
  } else if (Array.isArray(similarMarkets)) {
    markets = similarMarkets;
  } else {
    return null;
  }

  for (const m of markets) {
    if (typeof m === 'string' && m.includes('polymarket.com/event/')) return m;
    if (m && typeof m === 'object') {
      for (const key of ['url', 'link', 'href']) {
        const val = (m as Record<string, unknown>)[key];
        if (typeof val === 'string' && val.includes('polymarket.com/event/')) return val;
      }
    }
  }
  return null;
}

function pushCondition(conditions: ConditionInfo[], c: ConditionFields) {
  if (c.settled) return;
  conditions.push({
    id: c.id,
    resolver: c.resolver,
    question: c.question,
    estimatedPrice: c.estimatedPrice,
    similarMarkets: c.similarMarkets,
  });
}

/**
 * Extract unresolved conditions from a GQL questions response.
 * Handles both standalone conditions and group conditions.
 */
export function extractConditions(questions: Array<{
  questionType: string;
  group?: { conditions?: ConditionFields[] } | null;
  condition?: ConditionFields | null;
}>): ConditionInfo[] {
  const conditions: ConditionInfo[] = [];

  for (const q of questions) {
    if (q.condition) pushCondition(conditions, q.condition);
    if (q.group?.conditions) {
      for (const c of q.group.conditions) pushCondition(conditions, c);
    }
  }

  return conditions;
}

/**
 * Build random picks from available conditions.
 * Selects 2-5 conditions and assigns random predicted outcomes.
 */
export function buildRandomPicks(conditions: ConditionInfo[], count?: number): EnrichedPick[] {
  if (conditions.length === 0) return [];

  const pickCount = count ?? Math.min(Math.floor(Math.random() * 4) + 2, conditions.length);
  const shuffled = [...conditions].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, pickCount);

  return selected.map((c) => ({
    conditionResolver: c.resolver,
    conditionId: c.id,
    predictedOutcome: Math.random() < 0.5 ? OutcomeSide.YES : OutcomeSide.NO,
    question: c.question,
    estimatedPrice: c.estimatedPrice,
    polymarketUrl: extractPolymarketUrl(c.similarMarkets),
  }));
}
