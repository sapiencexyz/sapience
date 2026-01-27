// Position-specific helpers for OG image generation

// GraphQL query for fetching position data by NFT ID and market address
export const POSITION_BY_NFT_QUERY = `
  query PositionsByNftAndMarket($nftTokenId: String, $marketAddress: String) {
    positions(nftTokenId: $nftTokenId, marketAddress: $marketAddress, take: 1) {
      id
      chainId
      predictor
      counterparty
      predictorNftTokenId
      counterpartyNftTokenId
      predictorCollateral
      counterpartyCollateral
      totalCollateral
      predictions {
        conditionId
        outcomeYes
        condition {
          id
          question
          shortName
        }
      }
    }
  }
`;

// TypeScript interfaces for position data
export interface PositionPrediction {
  conditionId: string;
  outcomeYes: boolean;
  condition?: {
    id?: string;
    question?: string | null;
    shortName?: string | null;
  } | null;
}

export interface PositionData {
  id: string;
  chainId?: number;
  predictor?: string;
  counterparty?: string;
  predictorNftTokenId?: string;
  counterpartyNftTokenId?: string;
  predictorCollateral?: string;
  counterpartyCollateral?: string;
  totalCollateral?: string;
  predictions?: PositionPrediction[];
}

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
