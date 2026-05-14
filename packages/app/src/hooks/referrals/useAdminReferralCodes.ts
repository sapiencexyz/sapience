'use client';

import { useCallback, useMemo } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import { useAdminApi } from '~/hooks/useAdminApi';

export type AdminReferralCodeRow = {
  id: number;
  maxClaims: number;
  isActive: boolean;
  expiresAt: number | null;
  createdBy: string;
  creatorType: 'admin' | 'user';
  createdAt: string;
  claimCount: number;
  totalVolume: string;
  totalPositions: number;
};

export type AdminReferralAnalytics = {
  id: number;
  claimCount: number;
  totalVolume: string;
  totalPositions: number;
  claimants: Array<{
    address: string;
    tradingVolume: string;
    positionCount: number;
  }>;
};

export type CreateAdminReferralCodeInput = {
  code: string;
  maxClaims: number;
  expiresAt: number | null;
  createdBy: string | undefined;
};

export type UpdateAdminReferralCodeInput = {
  id: number;
  maxClaims: number;
  expiresAt: number | null;
  isActive: boolean;
};

const ADMIN_CODES_QUERY_KEY = ['admin', 'referralCodes'] as const;

// useAdminApi.base ends in `/admin`; mutations stay there. Reads now go to
// GraphQL, so we strip the suffix to derive the API root for fetch URLs.
function useApiBaseUrl(): string {
  const adminApi = useAdminApi();
  return useMemo(() => adminApi.base.replace(/\/admin$/, ''), [adminApi.base]);
}

function useReferralAdminMutate() {
  const adminApi = useAdminApi();
  const apiBaseUrl = useApiBaseUrl();

  return useCallback(
    async <T>(
      path: string,
      method: 'POST' | 'PUT' | 'DELETE',
      body?: Record<string, unknown>
    ): Promise<T> => {
      const { signature, signatureTimestamp } = await adminApi.sign();
      const response = await fetch(`${apiBaseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-admin-signature': signature,
          'x-admin-signature-timestamp': String(signatureTimestamp),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      } & Record<string, unknown>;
      if (!response.ok) {
        throw new Error(data?.error || data?.message || 'Request failed');
      }
      return data as T;
    },
    [adminApi, apiBaseUrl]
  );
}

// Reads use public GraphQL intentionally. Referral analytics are public because
// codes only affect attribution; create/update/delete mutations remain signed
// admin REST requests.
const REFERRAL_CODES_QUERY = `
  query AdminReferralCodes($take: Int!, $skip: Int!) {
    referralCodesPage(take: $take, skip: $skip) {
      items {
        id
        maxClaims
        isActive
        expiresAt
        createdBy
        creatorType
        createdAt
        claimCount
        totalVolume
        totalPositions
      }
      hasMore
    }
  }
`;

// Server caps `take` at 500 per page and `skip` at 10_000. We
// auto-paginate so the admin UI doesn't silently truncate at 500
// codes; MAX_PAGES (= maxSkip / PAGE_SIZE) is the safety net that
// matches the server cap so we don't loop fetching the same window.
const PAGE_SIZE = 500;
const MAX_PAGES = 20;

type ReferralCodesPageResponse = {
  referralCodesPage: {
    items: AdminReferralCodeRow[];
    hasMore: boolean;
  };
};

const REFERRAL_CODE_ANALYTICS_QUERY = `
  query AdminReferralCodeAnalytics($id: Int!, $claimantsLimit: Int!) {
    referralCodesPage(id: $id, take: 1) {
      items {
        id
        claimCount
        totalVolume
        totalPositions
        claimants(take: $claimantsLimit) {
          items {
            address
            tradingVolume
            positionCount
          }
          hasMore
        }
      }
    }
  }
`;

export function useAdminReferralCodes(): UseQueryResult<
  AdminReferralCodeRow[]
> {
  return useQuery<AdminReferralCodeRow[]>({
    queryKey: ADMIN_CODES_QUERY_KEY,
    queryFn: async () => {
      const all: AdminReferralCodeRow[] = [];
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const data: ReferralCodesPageResponse =
          await graphqlRequest<ReferralCodesPageResponse>(
            REFERRAL_CODES_QUERY,
            { take: PAGE_SIZE, skip: page * PAGE_SIZE }
          );
        all.push(...data.referralCodesPage.items);
        if (!data.referralCodesPage.hasMore) return all;
      }
      console.warn(
        `useAdminReferralCodes: stopped at MAX_PAGES (${MAX_PAGES}); results may be truncated`
      );
      return all;
    },
  });
}

export function useAdminReferralCodeAnalytics(
  id: number | undefined
): UseQueryResult<AdminReferralAnalytics> {
  return useQuery<AdminReferralAnalytics>({
    queryKey: ['admin', 'referralCodeAnalytics', id],
    queryFn: async () => {
      const data = await graphqlRequest<{
        referralCodesPage: {
          items: Array<{
            id: number;
            claimCount: number;
            totalVolume: string;
            totalPositions: number;
            claimants: {
              items: Array<{
                address: string;
                tradingVolume: string;
                positionCount: number;
              }>;
            };
          }>;
        };
      }>(REFERRAL_CODE_ANALYTICS_QUERY, { id, claimantsLimit: 500 });
      const code = data.referralCodesPage.items[0];
      if (!code) {
        throw new Error('Referral code not found');
      }
      return {
        id: code.id,
        claimCount: code.claimCount,
        totalVolume: code.totalVolume,
        totalPositions: code.totalPositions,
        claimants: code.claimants.items,
      };
    },
    enabled: typeof id === 'number',
  });
}

export function useCreateAdminReferralCode(): UseMutationResult<
  void,
  Error,
  CreateAdminReferralCodeInput
> {
  const referralAdminMutate = useReferralAdminMutate();
  const queryClient = useQueryClient();
  return useMutation<void, Error, CreateAdminReferralCodeInput>({
    mutationFn: (input) =>
      referralAdminMutate<void>('/referrals/admin/codes', 'POST', {
        code: input.code,
        maxClaims: input.maxClaims,
        expiresAt: input.expiresAt,
        createdBy: input.createdBy,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ADMIN_CODES_QUERY_KEY });
    },
  });
}

export function useUpdateAdminReferralCode(): UseMutationResult<
  void,
  Error,
  UpdateAdminReferralCodeInput
> {
  const referralAdminMutate = useReferralAdminMutate();
  const queryClient = useQueryClient();
  return useMutation<void, Error, UpdateAdminReferralCodeInput>({
    mutationFn: ({ id, ...body }) =>
      referralAdminMutate<void>(`/referrals/admin/codes/${id}`, 'PUT', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ADMIN_CODES_QUERY_KEY });
    },
  });
}

export function useDeleteAdminReferralCode(): UseMutationResult<
  void,
  Error,
  { id: number }
> {
  const referralAdminMutate = useReferralAdminMutate();
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: number }>({
    mutationFn: ({ id }) =>
      referralAdminMutate<void>(`/referrals/admin/codes/${id}`, 'DELETE'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ADMIN_CODES_QUERY_KEY });
    },
  });
}
