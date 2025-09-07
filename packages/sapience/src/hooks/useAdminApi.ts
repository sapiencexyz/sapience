'use client';

import { useSignMessage } from 'wagmi';
import { useSettings } from '~/lib/context/SettingsContext';
import { ADMIN_AUTHENTICATE_MSG } from '~/lib/constants';

export function useAdminApi() {
  const { signMessageAsync } = useSignMessage();
  const { adminBaseUrl, defaults } = useSettings();
  const base = adminBaseUrl ?? `${defaults.adminBaseUrl}`;

  const sign = async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await signMessageAsync({
      message: ADMIN_AUTHENTICATE_MSG,
    });
    return { signature, timestamp, signatureTimestamp: timestamp } as const;
  };

  const headers: HeadersInit = { 'Content-Type': 'application/json' };

  const postJson = async <
    T = unknown,
    B extends object = Record<string, unknown>,
  >(
    path: string,
    body: B
  ): Promise<T> => {
    const { signature, timestamp, signatureTimestamp } = await sign();
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...(body as Record<string, unknown>),
        signature,
        timestamp,
        signatureTimestamp,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        (data && (data.error || data.message)) || 'Request failed'
      );
    return data as T;
  };

  const putJson = async <
    T = unknown,
    B extends object = Record<string, unknown>,
  >(
    path: string,
    body: B
  ): Promise<T> => {
    const { signature, timestamp, signatureTimestamp } = await sign();
    const response = await fetch(`${base}${path}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        ...(body as Record<string, unknown>),
        signature,
        timestamp,
        signatureTimestamp,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        (data && (data.error || data.message)) || 'Request failed'
      );
    return data as T;
  };

  const deleteJson = async <
    T = unknown,
    B extends object = Record<string, unknown>,
  >(
    path: string,
    body?: B
  ): Promise<T> => {
    const { signature, timestamp, signatureTimestamp } = await sign();
    const response = await fetch(`${base}${path}`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({
        ...((body || {}) as Record<string, unknown>),
        signature,
        timestamp,
        signatureTimestamp,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        (data && (data.error || data.message)) || 'Request failed'
      );
    return data as T;
  };

  const withSignatureQuery = async (path: string) => {
    const { signature, signatureTimestamp } = await sign();
    const u = new URL(`${base}${path}`);
    u.searchParams.set('signature', signature);
    u.searchParams.set('signatureTimestamp', String(signatureTimestamp));
    return u.toString();
  };

  return { base, sign, postJson, putJson, deleteJson, withSignatureQuery };
}
