import type { ConditionsMap } from '~/components/positions/toPickLegs';

/**
 * Check if a timestamp (in milliseconds) falls within a date range
 * specified as [minDays, maxDays] from now.
 * Negative days = past, positive days = future.
 */
export function isWithinDateRange(
  timestampMs: number,
  dateRange: [number, number]
): boolean {
  if (dateRange[0] === -Infinity && dateRange[1] === Infinity) return true;
  const nowMs = Date.now();
  const daysFromNow = (timestampMs - nowMs) / (1000 * 60 * 60 * 24);
  return daysFromNow >= dateRange[0] && daysFromNow <= dateRange[1];
}

/**
 * Check if any condition question text for the given conditionIds
 * matches a search term (case-insensitive).
 */
export function matchesConditionSearch(
  searchTerm: string,
  conditionIds: string[],
  conditionsMap: ConditionsMap
): boolean {
  const term = searchTerm.toLowerCase();
  for (const id of conditionIds) {
    const condition = conditionsMap.get(id);
    if (!condition) continue;
    const text = (
      condition.shortName ||
      condition.question ||
      ''
    ).toLowerCase();
    if (text.includes(term)) return true;
  }
  return false;
}
