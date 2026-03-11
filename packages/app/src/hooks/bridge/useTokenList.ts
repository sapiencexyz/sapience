'use client';

import { useQuery } from '@tanstack/react-query';

export type TokenListToken = {
  chainId: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  tags: string[];
  extensions: {
    pickConfigId: string;
    result: string;
    sapience: boolean;
  };
};

type TokenListResponse = {
  name: string;
  logoURI: string;
  timestamp: string;
  version: { major: number; minor: number; patch: number };
  tokens: TokenListToken[];
};

const API_URL =
  process.env.NEXT_PUBLIC_FOIL_API_URL || 'https://api.sapience.xyz';

export function useTokenList() {
  const { data, isLoading, error } = useQuery<TokenListToken[]>({
    queryKey: ['tokenList'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/tokenlist.json`);
      if (!res.ok) throw new Error('Failed to fetch token list');
      const json: TokenListResponse = await res.json();
      return json.tokens;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return {
    tokens: data ?? [],
    isLoading,
    error,
  };
}
