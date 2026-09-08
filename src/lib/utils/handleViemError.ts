import { BaseError } from 'viem';

/**
 * handleViemError - Utility function to extract user-friendly error messages from Viem errors
 *
 * This function processes Viem BaseError instances and their nested causes to extract the most
 * relevant error message for user display. It traverses the error cause chain to find the root
 * error and returns either the shortMessage from Viem errors or falls back to the provided
 * default message. This ensures consistent error handling across the application and provides
 * meaningful feedback to users when blockchain operations fail.
 */
export function handleViemError(
  error: unknown,
  defaultMessage: string
): string {
  if (error instanceof BaseError) {
    let root: BaseError = error;
    while (root.cause instanceof BaseError) {
      root = root.cause;
    }
    return (root as { shortMessage: string }).shortMessage ?? defaultMessage;
  }

  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Session key policy errors from ZeroDev smart accounts.
 *
 * These occur when the session key's permission policy doesn't match the
 * current contract addresses (e.g. after an escrow redeploy). The session
 * must be re-created to pick up the new addresses.
 *
 * We require both conditions:
 * - AA23 (account validation reverted) — the bundler rejection code
 * - CallViolatesParamRule / 0x59d52e40 — the specific revert reason
 *
 * AA23 alone is too broad (any validation failure), and the revert selector
 * alone could appear in non-bundler contexts. Together they're precise.
 */
const REVERT_PATTERNS = ['CallViolatesParamRule', '0x59d52e40'] as const;

/** Returns true if the error indicates a stale session key policy. */
export function isSessionPolicyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    message.includes('AA23') &&
    REVERT_PATTERNS.some((pattern) => message.includes(pattern))
  );
}
