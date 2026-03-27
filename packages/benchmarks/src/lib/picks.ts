import type { PickJson } from '@sapience/sdk/types/escrow';

interface ConditionInfo {
  id: string;
  resolver: string;
}

/**
 * Extract unresolved conditions from a GQL questions response.
 * Handles both standalone conditions and group conditions.
 */
export function extractConditions(questions: Array<{
  questionType: string;
  group?: { conditions?: Array<{ id: string; resolver: string; settled?: boolean }> } | null;
  condition?: { id: string; resolver: string; settled?: boolean } | null;
}>): ConditionInfo[] {
  const conditions: ConditionInfo[] = [];

  for (const q of questions) {
    if (q.condition && !q.condition.settled) {
      conditions.push({ id: q.condition.id, resolver: q.condition.resolver });
    }
    if (q.group?.conditions) {
      for (const c of q.group.conditions) {
        if (!c.settled) {
          conditions.push({ id: c.id, resolver: c.resolver });
        }
      }
    }
  }

  return conditions;
}

/**
 * Build random picks from available conditions.
 * Selects 1-3 conditions and assigns random predicted outcomes.
 */
export function buildRandomPicks(conditions: ConditionInfo[], count?: number): PickJson[] {
  if (conditions.length === 0) return [];

  const pickCount = count ?? Math.min(Math.floor(Math.random() * 3) + 1, conditions.length);
  const shuffled = [...conditions].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, pickCount);

  return selected.map((c) => ({
    conditionResolver: c.resolver,
    conditionId: c.id,
    predictedOutcome: Math.random() < 0.5 ? 0 : 1,
  }));
}
