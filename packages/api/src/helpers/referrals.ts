import { keccak256, stringToHex } from 'viem';

/**
 * Compute the canonical referral code hash:
 * keccak256(utf8(trimmed_lowercase_code)) as 0x-prefixed hex string.
 */
export function hashReferralCode(plaintext: string): `0x${string}` {
  const normalized = plaintext.trim().toLowerCase();
  if (!normalized) {
    throw new Error('Referral code cannot be empty after trimming');
  }
  const bytes = stringToHex(normalized);
  return keccak256(bytes);
}
