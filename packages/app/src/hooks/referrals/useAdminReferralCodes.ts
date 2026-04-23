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
  codeHash: string;
  maxClaims: number;
  isActive: boolean;
  expiresAt: number | null;
  createdBy: string;
  creatorType: 'admin' | 'user';
  createdAt: string;
  claimCount: number;
};

export type AdminReferralAnalytics = {
  codeHash: string;
  claimCount: number;
  claimants: Array<{
    address: string;
    tradingVolume: string;
    positionCount: number;
  }>;
  totalVolume: string;
  totalPositions: number;
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

// The referral admin endpoints live at `/referrals/admin/...` on the API root,
// not under the `/admin` prefix exposed by `useAdminApi`.
function useReferralAdminFetch() {
  const adminApi = useAdminApi();
  const apiBaseUrl = useMemo(
    () => adminApi.base.replace(/\/admin$/, ''),
    [adminApi.base]
  );

  return useCallback(
    async <T>(
      path: string,
      method: 'GET' | 'POST' | 'PUT' | 'DELETE',
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
  const referralAdminFetch = useReferralAdminFetch();
  return useQuery<AdminReferralCodeRow[]>({
    queryKey: ADMIN_CODES_QUERY_KEY,
    queryFn: () =>
      referralAdminFetch<AdminReferralCodeRow[]>(
        '/referrals/admin/codes',
        'GET'
      ),
  });
}

export function useAdminReferralCodeAnalytics(
  id: number | undefined
): UseQueryResult<AdminReferralAnalytics> {
  const referralAdminFetch = useReferralAdminFetch();
  return useQuery<AdminReferralAnalytics>({
    queryKey: ['admin', 'referralCodeAnalytics', id],
    queryFn: () =>
      referralAdminFetch<AdminReferralAnalytics>(
        `/referrals/admin/codes/${id}/analytics`,
        'GET'
      ),
    enabled: typeof id === 'number',
  });
}

export function useCreateAdminReferralCode(): UseMutationResult<
  void,
  Error,
  CreateAdminReferralCodeInput
> {
  const referralAdminFetch = useReferralAdminFetch();
  const queryClient = useQueryClient();
  return useMutation<void, Error, CreateAdminReferralCodeInput>({
    mutationFn: (input) =>
      referralAdminFetch<void>('/referrals/admin/codes', 'POST', {
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
  const referralAdminFetch = useReferralAdminFetch();
  const queryClient = useQueryClient();
  return useMutation<void, Error, UpdateAdminReferralCodeInput>({
    mutationFn: ({ id, ...body }) =>
      referralAdminFetch<void>(`/referrals/admin/codes/${id}`, 'PUT', body),
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
  const referralAdminFetch = useReferralAdminFetch();
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: number }>({
    mutationFn: ({ id }) =>
      referralAdminFetch<void>(`/referrals/admin/codes/${id}`, 'DELETE'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ADMIN_CODES_QUERY_KEY });
    },
  });
}
