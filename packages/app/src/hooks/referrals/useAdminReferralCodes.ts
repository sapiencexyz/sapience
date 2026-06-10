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
  query AdminReferralCodes($limit: Int!, $cursor: Int) {
    referralCodes(limit: $limit, cursor: $cursor) {
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
      nextCursor
    }
  }
`;

// The API rejects any `limit` above GRAPHQL_MAX_LIST_SIZE (100) with a 400.
// We auto-paginate so the admin UI doesn't silently truncate; MAX_PAGES is a
// safety net against a buggy server returning a non-progressing cursor.
const PAGE_SIZE = 100;
const MAX_PAGES = 50;

type ReferralCodesPageResponse = {
  referralCodes: {
    items: AdminReferralCodeRow[];
    nextCursor: number | null;
  };
};

type ReferralCodeAnalyticsResponse = {
  referralCodes: {
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
        nextCursor: number | null;
      };
    }>;
  };
};

const REFERRAL_CODE_ANALYTICS_QUERY = `
  query AdminReferralCodeAnalytics($id: Int!, $claimantsLimit: Int!, $claimantsCursor: Int) {
    referralCodes(id: $id, limit: 1) {
      items {
        id
        claimCount
        totalVolume
        totalPositions
        claimants(limit: $claimantsLimit, cursor: $claimantsCursor) {
          items {
            address
            tradingVolume
            positionCount
          }
          nextCursor
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
      let cursor: number | null = null;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const data: ReferralCodesPageResponse =
          await graphqlRequest<ReferralCodesPageResponse>(
            REFERRAL_CODES_QUERY,
            { limit: PAGE_SIZE, cursor }
          );
        all.push(...data.referralCodes.items);
        if (data.referralCodes.nextCursor == null) return all;
        cursor = data.referralCodes.nextCursor;
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
      const claimants: AdminReferralAnalytics['claimants'] = [];
      let code: {
        id: number;
        claimCount: number;
        totalVolume: string;
        totalPositions: number;
      } | null = null;
      let cursor: number | null = null;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const data: ReferralCodeAnalyticsResponse =
          await graphqlRequest<ReferralCodeAnalyticsResponse>(
            REFERRAL_CODE_ANALYTICS_QUERY,
            { id, claimantsLimit: PAGE_SIZE, claimantsCursor: cursor }
          );
        const item = data.referralCodes.items[0];
        if (!item) {
          throw new Error('Referral code not found');
        }
        code ??= item;
        claimants.push(...item.claimants.items);
        cursor = item.claimants.nextCursor;
        if (cursor == null) break;
        if (page === MAX_PAGES - 1) {
          console.warn(
            `useAdminReferralCodeAnalytics: stopped at MAX_PAGES (${MAX_PAGES}); claimants may be truncated`
          );
        }
      }
      if (!code) {
        throw new Error('Referral code not found');
      }
      return {
        id: code.id,
        claimCount: code.claimCount,
        totalVolume: code.totalVolume,
        totalPositions: code.totalPositions,
        claimants,
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
