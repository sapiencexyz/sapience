export function getQuestionHref({
  conditionId,
  resolverAddress,
}: {
  conditionId?: string | null;
  resolverAddress?: string | null;
}): string {
  if (!conditionId) return '#';
  // Use only the provided resolver address, no fallbacks
  if (!resolverAddress) return `/questions/${conditionId}`;
  return `/questions/${resolverAddress}/${conditionId}`;
}
