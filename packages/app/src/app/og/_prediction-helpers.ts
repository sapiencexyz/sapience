// OG-specific formatting utilities + re-exports from shared data layer.

// Re-exports for backward compatibility with OG routes and _profile-helpers
export { getGraphQLEndpoint } from '~/lib/data/graphql';
export {
  PREDICTION_BY_ID_QUERY,
  CONDITIONS_BY_IDS_QUERY,
  type PredictionPick,
  type PredictionPickConfig,
  type PredictionData,
  type ConditionData,
} from '~/lib/data/predictions';

// Helper to format units (18 decimals for collateral)
export function formatUnits(value: string, decimals: number = 18): string {
  try {
    const bigIntValue = BigInt(value);
    const divisor = BigInt(10 ** decimals);
    const whole = bigIntValue / divisor;
    const remainder = bigIntValue % divisor;
    if (remainder === 0n) {
      return whole.toString();
    }
    const remainderStr = remainder.toString().padStart(decimals, '0');
    const trimmed = remainderStr.replace(/0+$/, '');
    return `${whole}.${trimmed}`;
  } catch {
    return '0';
  }
}

// Helper to normalize choice labels to standard format
export function normalizeChoiceLabel(label: string): 'YES' | 'NO' | null {
  const upper = label.toUpperCase();
  if (upper === 'YES' || upper.startsWith('YES')) return 'YES';
  if (upper === 'NO' || upper.startsWith('NO')) return 'NO';
  return null;
}

// Helper to determine pill tone from normalized choice
export function getChoiceTone(
  normalized: 'YES' | 'NO' | null
): 'success' | 'danger' | 'neutral' {
  if (normalized === 'YES') return 'success';
  if (normalized === 'NO') return 'danger';
  return 'neutral';
}

// Helper to round numbers to two decimal places
export function roundToTwoDecimals(value: string): string {
  try {
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    return num.toFixed(2);
  } catch {
    return value;
  }
}
