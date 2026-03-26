/**
 * Filter conditions by resolver address (case-insensitive).
 */
export function filterByResolver<T extends { resolver: string | null }>(
  conditions: T[],
  resolverAddress: string
): T[] {
  const target = resolverAddress.toLowerCase();
  return conditions.filter((c) => c.resolver?.toLowerCase() === target);
}
