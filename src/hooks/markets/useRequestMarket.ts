'use client';

import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { getNetworkEndpointDefaults } from '~/lib/config/networkDefaults';

function getPublicApiBaseUrl(): string {
  // Follows the app's active network (Robinhood → Meridian API), not env.
  return getNetworkEndpointDefaults().apiOrigin;
}

export class MarketRequestApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'MarketRequestApiError';
    this.status = status;
  }
}

export type RequestMarketInput = {
  /** The ticker / market name the user searched for */
  ticker: string;
  /** Optional Polymarket URL so the team can mirror the exact market */
  polymarketUrl?: string;
  /** Optional free-text note */
  note?: string;
  /** Optional connected wallet address */
  walletAddress?: string;
};

export type RequestMarketResponse = {
  delivered: boolean;
};

export function useRequestMarket(): UseMutationResult<
  RequestMarketResponse,
  Error,
  RequestMarketInput
> {
  return useMutation<RequestMarketResponse, Error, RequestMarketInput>({
    mutationFn: async (input) => {
      const res = await fetch(`${getPublicApiBaseUrl()}/market-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: input.ticker,
          ...(input.polymarketUrl
            ? { polymarketUrl: input.polymarketUrl }
            : {}),
          ...(input.note ? { note: input.note } : {}),
          ...(input.walletAddress
            ? { walletAddress: input.walletAddress }
            : {}),
        }),
      });

      if (!res.ok) {
        let message = 'Failed to submit market request';
        try {
          const data = (await res.json()) as { message?: string };
          if (data?.message) message = data.message;
        } catch {
          /* ignore parse errors */
        }
        throw new MarketRequestApiError(res.status, message);
      }

      return (await res.json()) as RequestMarketResponse;
    },
  });
}
