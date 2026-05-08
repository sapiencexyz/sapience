'use client';

import {
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';

function getPublicApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_FOIL_API_URL || 'https://api.sapience.xyz';
}

export class ReferralApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ReferralApiError';
    this.status = status;
  }
}

// Best-effort local persistence so we can avoid re-prompting users who have
// already provided a code. Silent on failure (e.g. privacy mode / SSR).
export function persistReferralCodeLocally(
  walletAddress: string,
  code: string
): void {
  try {
    if (typeof window !== 'undefined') {
      const key = `sapience:referralCode:${walletAddress.toLowerCase()}`;
      window.localStorage.setItem(key, code);
    }
  } catch {
    /* noop */
  }
}

type ReferralClaimResponse = {
  allowed?: boolean;
  index?: number | null;
  maxReferrals?: number;
  message?: string;
};

export type ClaimReferralCodeInput = {
  walletAddress: string;
  codePlaintext: string;
  signature: string;
};

export function useClaimReferralCode(): UseMutationResult<
  ReferralClaimResponse,
  Error,
  ClaimReferralCodeInput
> {
  return useMutation<ReferralClaimResponse, Error, ClaimReferralCodeInput>({
    mutationFn: async (input) => {
      const response = await fetch(`${getPublicApiBaseUrl()}/referrals/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = (await response
        .json()
        .catch(() => null)) as ReferralClaimResponse | null;
      if (!response.ok) {
        throw new ReferralApiError(
          response.status,
          data?.message || 'Unknown error'
        );
      }
      return data ?? {};
    },
  });
}

export type SetReferralCodeInput = {
  walletAddress: string;
  codePlaintext: string;
  signature: string;
};

export function useSetReferralCode(): UseMutationResult<
  void,
  Error,
  SetReferralCodeInput
> {
  return useMutation<void, Error, SetReferralCodeInput>({
    mutationFn: async (input) => {
      const response = await fetch(`${getPublicApiBaseUrl()}/referrals/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new ReferralApiError(
          response.status,
          data?.message || 'Unable to set referral code. Please try again.'
        );
      }
    },
  });
}

export type UserReferralsData = {
  user: {
    address: string;
    refCodeHash: string | null;
    maxReferrals: number;
    referrals: { address: string; createdAt: string }[];
  } | null;
};

const USER_REFERRALS_QUERY = `
  query UserReferrals($wallet: String!) {
    user(address: $wallet) {
      address
      refCodeHash
      maxReferrals
      referrals {
        address
        createdAt
      }
    }
  }
`;

export function useUserReferrals(
  walletAddress: string | null | undefined,
  enabled: boolean
): UseQueryResult<UserReferralsData> {
  return useQuery<UserReferralsData>({
    queryKey: ['userReferrals', walletAddress?.toLowerCase() ?? null],
    queryFn: () =>
      graphqlRequest<UserReferralsData>(USER_REFERRALS_QUERY, {
        wallet: (walletAddress ?? '').toLowerCase(),
      }),
    enabled: enabled && Boolean(walletAddress),
  });
}
