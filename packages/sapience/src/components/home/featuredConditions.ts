import type { ConditionType } from '~/hooks/graphql/useConditions';

export function isActivePublicCondition(
  condition: ConditionType,
  nowSeconds: number
): boolean {
  if (!condition) return false;
  if (typeof condition.endTime !== 'number' || condition.endTime <= 0) {
    return false;
  }
  if (!condition.public) return false;
  return nowSeconds <= condition.endTime;
}

export function getActivePublicConditions(
  conditions: ConditionType[] | undefined | null,
  nowSeconds: number
): ConditionType[] {
  if (!Array.isArray(conditions)) return [];
  return conditions.filter((c) => isActivePublicCondition(c, nowSeconds));
}

export function hasActivePublicConditions(
  conditions: ConditionType[] | undefined | null,
  nowSeconds: number
): boolean {
  if (!Array.isArray(conditions)) return false;
  return conditions.some((c) => isActivePublicCondition(c, nowSeconds));
}
