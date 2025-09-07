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
      message: `${ADMIN_AUTHENTICATE_MSG}:${timestamp}`,
    });
    return { signature, timestamp, signatureTimestamp: timestamp } as const;
  };

  const buildHeaders = async (): Promise<HeadersInit> => {
    const { signature, timestamp } = await sign();
    return {
      'Content-Type': 'application/json',
      'x-admin-signature': signature,
      'x-admin-signature-timestamp': String(timestamp),
    } as const;
  };

  const postJson = async <
    T = unknown,
    B extends object = Record<string, unknown>,
  >(
    path: string,
    body: B
  ): Promise<T> => {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: await buildHeaders(),
      body: JSON.stringify(body as Record<string, unknown>),
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
    const response = await fetch(`${base}${path}`, {
      method: 'PUT',
      headers: await buildHeaders(),
      body: JSON.stringify(body as Record<string, unknown>),
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
    const response = await fetch(`${base}${path}`, {
      method: 'DELETE',
      headers: await buildHeaders(),
      body: JSON.stringify((body || {}) as Record<string, unknown>),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        (data && (data.error || data.message)) || 'Request failed'
      );
    return data as T;
  };

  const getJson = async <T = unknown>(path: string): Promise<T> => {
    const response = await fetch(`${base}${path}`, {
      method: 'GET',
      headers: await buildHeaders(),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        (data && (data.error || data.message)) || 'Request failed'
      );
    return data as T;
  };

  return { base, sign, postJson, putJson, deleteJson, getJson };
}
