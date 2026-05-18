'use client';

import { useCallback, useMemo } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
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

// `useAdminApi.base` ends in `/admin`; mutations stay there. Reads hit the
// public `/referrals/codes` REST surface, so we strip the suffix to derive
// the API root.
function useApiBaseUrl(): string {
  const adminApi = useAdminApi();
  return useMemo(() => adminApi.base.replace(/\/admin$/, ''), [adminApi.base]);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  } & Record<string, unknown>;
  if (!response.ok) {
    throw new Error(data?.error || data?.message || 'Request failed');
  }
  return data as T;
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

export function useAdminReferralCodes(): UseQueryResult<
  AdminReferralCodeRow[]
> {
  const apiBaseUrl = useApiBaseUrl();
  return useQuery<AdminReferralCodeRow[]>({
    queryKey: ADMIN_CODES_QUERY_KEY,
    queryFn: async () => {
      const data = await fetchJson<{ items: AdminReferralCodeRow[] }>(
        `${apiBaseUrl}/referrals/codes`
      );
      return data.items;
    },
  });
}

export function useAdminReferralCodeAnalytics(
  id: number | undefined
): UseQueryResult<AdminReferralAnalytics> {
  const apiBaseUrl = useApiBaseUrl();
  return useQuery<AdminReferralAnalytics>({
    queryKey: ['admin', 'referralCodeAnalytics', id],
    queryFn: () =>
      fetchJson<AdminReferralAnalytics>(`${apiBaseUrl}/referrals/codes/${id}`),
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
