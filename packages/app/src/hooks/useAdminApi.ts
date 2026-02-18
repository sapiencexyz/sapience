'use client';

import { useRef } from 'react';
import { useSignMessage } from 'wagmi';
import { useSettings } from '~/lib/context/SettingsContext';
import { ADMIN_AUTHENTICATE_MSG } from '~/lib/constants';

export function useAdminApi() {
  const { signMessageAsync } = useSignMessage();
  const { adminBaseUrl, defaults } = useSettings();
  const base = adminBaseUrl ?? `${defaults.adminBaseUrl}`;
  const lastSignatureRef = useRef<{ sig: string; ts: number } | null>(null);
  const SIGN_TTL_SEC = 60; // reuse signature for 60s to prevent sign loops

  const sign = async () => {
    const now = Math.floor(Date.now() / 1000);
    const cached = lastSignatureRef.current;
    if (cached && now - cached.ts <= SIGN_TTL_SEC) {
      return {
        signature: cached.sig,
        timestamp: cached.ts,
        signatureTimestamp: cached.ts,
      } as const;
    }
    const timestamp = now;
    const signature = await signMessageAsync({
      message: `${ADMIN_AUTHENTICATE_MSG}:${timestamp}`,
    });
    lastSignatureRef.current = { sig: signature, ts: timestamp };
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
    const doFetch = async () =>
      fetch(`${base}${path}`, {
        method: 'POST',
        headers: await buildHeaders(),
        body: JSON.stringify(body as Record<string, unknown>),
      });
    let response = await doFetch();
    if (response.status === 401 || response.status === 403) {
      lastSignatureRef.current = null; // force re-sign once
      response = await doFetch();
    }
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
    const doFetch = async () =>
      fetch(`${base}${path}`, {
        method: 'PUT',
        headers: await buildHeaders(),
        body: JSON.stringify(body as Record<string, unknown>),
      });
    let response = await doFetch();
    if (response.status === 401 || response.status === 403) {
      lastSignatureRef.current = null;
      response = await doFetch();
    }
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
    const doFetch = async () =>
      fetch(`${base}${path}`, {
        method: 'DELETE',
        headers: await buildHeaders(),
        body: JSON.stringify((body || {}) as Record<string, unknown>),
      });
    let response = await doFetch();
    if (response.status === 401 || response.status === 403) {
      lastSignatureRef.current = null;
      response = await doFetch();
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        (data && (data.error || data.message)) || 'Request failed'
      );
    return data as T;
  };

  const getJson = async <T = unknown>(path: string): Promise<T> => {
    const doFetch = async () =>
      fetch(`${base}${path}`, {
        method: 'GET',
        headers: await buildHeaders(),
      });
    let response = await doFetch();
    if (response.status === 401 || response.status === 403) {
      lastSignatureRef.current = null;
      response = await doFetch();
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        (data && (data.error || data.message)) || 'Request failed'
      );
    return data as T;
  };

  return { base, sign, postJson, putJson, deleteJson, getJson };
}
