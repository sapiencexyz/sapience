import { keccak256, stringToHex } from 'viem';

export const MAX_REFERRAL_CODE_LENGTH = 16;

/**
 * Compute the canonical referral code hash:
 * keccak256(utf8(trimmed_lowercase_code)) as 0x-prefixed hex string.
 */
export function hashReferralCode(plaintext: string): `0x${string}` {
  const normalized = plaintext.trim().toLowerCase();
  if (!normalized) {
    throw new Error('Referral code cannot be empty after trimming');
  }
  if (normalized.length > MAX_REFERRAL_CODE_LENGTH) {
    throw new Error(
      `Referral code cannot exceed ${MAX_REFERRAL_CODE_LENGTH} characters`
    );
  }
  const bytes = stringToHex(normalized);
  return keccak256(bytes);
}
