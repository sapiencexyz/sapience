// Prediction-specific helpers for OG image generation

// Helper to get GraphQL endpoint URL
export function getGraphQLEndpoint(): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_FOIL_API_URL || 'https://api.sapience.xyz';
  try {
    const u = new URL(baseUrl);
    return `${u.origin}/graphql`;
  } catch {
    return 'https://api.sapience.xyz/graphql';
  }
}

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
export function normalizeChoiceLabel(
  label: string
): 'YES' | 'NO' | 'OVER' | 'UNDER' | null {
  const upper = label.toUpperCase();
  if (upper === 'YES' || upper.startsWith('YES')) return 'YES';
  if (upper === 'NO' || upper.startsWith('NO')) return 'NO';
  if (upper === 'OVER' || upper.startsWith('OVER')) return 'OVER';
  if (upper === 'UNDER' || upper.startsWith('UNDER')) return 'UNDER';
  return null;
}

// Helper to determine pill tone from normalized choice
export function getChoiceTone(
  normalized: 'YES' | 'NO' | 'OVER' | 'UNDER' | null
): 'success' | 'danger' | 'neutral' {
  if (normalized === 'YES' || normalized === 'OVER') return 'success';
  if (normalized === 'NO' || normalized === 'UNDER') return 'danger';
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

// GraphQL query for fetching prediction data by predictionId
export const PREDICTION_BY_ID_QUERY = `
  query Prediction($predictionId: String!) {
    prediction(predictionId: $predictionId) {
      id
      predictionId
      chainId
      marketAddress
      predictor
      counterparty
      predictorToken
      counterpartyToken
      predictorCollateral
      counterpartyCollateral
      settled
      settledAt
      result
      createdAt
      pickConfig {
        id
        chainId
        marketAddress
        resolved
        result
        resolvedAt
        endsAt
        picks {
          id
          conditionResolver
          conditionId
          predictedOutcome
        }
      }
    }
  }
`;

// Query to fetch condition question text for picks
export const CONDITIONS_BY_IDS_QUERY = `
  query ConditionsByIds($where: ConditionWhereInput!) {
    conditions(where: $where, take: 100) {
      id
      question
      shortName
      endTime
      settled
      resolvedToYes
      resolver
      category { slug }
    }
  }
`;

// TypeScript interfaces for prediction OG data
export interface PredictionPick {
  id: number;
  conditionResolver: string;
  conditionId: string;
  predictedOutcome: number;
}

export interface PredictionPickConfig {
  id: string;
  chainId: number;
  marketAddress: string;
  resolved: boolean;
  result: string;
  resolvedAt?: number | null;
  endsAt?: number | null;
  picks: PredictionPick[];
}

export interface PredictionData {
  id: number;
  predictionId: string;
  chainId: number;
  marketAddress: string;
  predictor: string;
  counterparty: string;
  predictorToken: string;
  counterpartyToken: string;
  predictorCollateral: string;
  counterpartyCollateral: string;
  settled: boolean;
  settledAt?: number | null;
  result: string;
  createdAt: string;
  pickConfig?: PredictionPickConfig | null;
}

export interface ConditionData {
  id: string;
  question?: string | null;
  shortName?: string | null;
  endTime?: number | null;
  settled?: boolean;
  resolvedToYes?: boolean;
  resolver?: string | null;
  category?: { slug?: string | null } | null;
}
