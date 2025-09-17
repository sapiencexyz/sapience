import type { MarketGroup as MarketGroupType } from '@sapience/ui/types/graphql';

export interface QuoteApiParams {
  baseCandidate?: string | null;
  marketData: Pick<MarketGroupType, 'chainId' | 'address'>;
  marketId: number;
  expectedPrice: number;
  collateralAvailable: bigint;
}

export interface QuoteApiResponse {
  direction?: 'LONG' | 'SHORT';
  maxSize: string; // BigInt string
  expectedPrice?: string; // Decimal string
  collateralAvailable?: string; // BigInt string
  error?: string;
}

export function normalizeBase(baseCandidate?: string | null): string | null {
  if (!baseCandidate) return null;
  try {
    const u = new URL(baseCandidate);
    return u.origin;
  } catch {
    return baseCandidate.endsWith('/')
      ? baseCandidate.slice(0, -1)
      : baseCandidate;
  }
}

export function withQuoterPrefix(base: string): string {
  try {
    const u = new URL(base);
    if (u.pathname === '/quoter' || u.pathname.startsWith('/quoter/')) {
      return base;
    }
  } catch {
    if (base.endsWith('/quoter') || base.includes('/quoter/')) {
      return base;
    }
  }
  return `${base}/quoter`;
}

export function toQuoteUrl(params: QuoteApiParams): string {
  const {
    baseCandidate,
    marketData,
    marketId,
    expectedPrice,
    collateralAvailable,
  } = params;
  const base = normalizeBase(baseCandidate);
  if (!base) throw new Error('Quoter URL not configured.');
  const prefix = withQuoterPrefix(base);
  return `${prefix}/${marketData.chainId}/${marketData.address}/${marketId}/?expectedPrice=${expectedPrice}&collateralAvailable=${collateralAvailable.toString()}&maxIterations=${10}`;
}

export async function fetchQuoteByUrl(url: string): Promise<QuoteApiResponse> {
  const response = await fetch(url);
  const data = (await response.json()) as QuoteApiResponse;
  if (!response.ok) {
    throw new Error(data?.error || `HTTP error! status: ${response.status}`);
  }
  return data;
}
