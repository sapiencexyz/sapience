/**
 * Authentication utilities
 */

import { privateKeyToAccount } from 'viem/accounts';
import { ADMIN_AUTHENTICATE_MSG } from '../constants';

/**
 * Get admin auth headers by signing the authentication message
 * The API expects signature-based auth, not Bearer tokens
 */
export async function getAdminAuthHeaders(privateKey: `0x${string}`): Promise<{
  'x-admin-signature': string;
  'x-admin-signature-timestamp': string;
}> {
  const account = privateKeyToAccount(privateKey);
  const timestampSeconds = Math.floor(Date.now() / 1000);
  const messageToSign = `${ADMIN_AUTHENTICATE_MSG}:${timestampSeconds}`;

  const signature = await account.signMessage({ message: messageToSign });

  return {
    'x-admin-signature': signature,
    'x-admin-signature-timestamp': String(timestampSeconds),
  };
}

/**
 * Validate and format a private key
 * Returns undefined if no key provided, throws if invalid
 */
export function validatePrivateKey(rawPrivateKey: string | undefined): `0x${string}` | undefined {
  if (!rawPrivateKey) {
    return undefined;
  }

  const formattedKey = rawPrivateKey.startsWith('0x')
    ? rawPrivateKey
    : `0x${rawPrivateKey}`;

  if (/^0x[0-9a-fA-F]{64}$/.test(formattedKey)) {
    return formattedKey as `0x${string}`;
  }

  throw new Error('ADMIN_PRIVATE_KEY is invalid (must be 64 hex chars, optionally 0x-prefixed)');
}
