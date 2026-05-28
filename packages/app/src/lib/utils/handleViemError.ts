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
 * current contract addresses (e.g. after an escrow redeploy, or when a flow
 * starts calling a contract that the existing session was never authorized to
 * call). The session must be re-created to pick up the new addresses/policies.
 *
 * We require both conditions:
 * - a user-op/account-validation failure marker from the bundler/paymaster path
 * - a call-policy / not-authorized marker from the session policy validation
 *
 * AA23 alone is too broad (any validation failure), and the policy markers alone
 * could appear in non-session contexts. Together they're precise enough to
 * clear the stale session and offer recovery.
 */
const USER_OP_VALIDATION_PATTERNS = [
  'AA23',
  'account validation reverted',
  'UserOperation reverted during simulation',
  'user operation reverted during simulation',
] as const;

const SESSION_POLICY_PATTERNS = [
  'CallViolatesParamRule',
  'CallViolatesTarget',
  'CallViolatesTargetAddress',
  'CallNotAllowed',
  'TargetNotAllowed',
  'not authorized',
  'not authorised',
  '0x59d52e40',
] as const;

/** Returns true if the error indicates a stale session key policy. */
export function isSessionPolicyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const lowerMessage = message.toLowerCase();

  const hasUserOpValidationFailure = USER_OP_VALIDATION_PATTERNS.some(
    (pattern) => lowerMessage.includes(pattern.toLowerCase())
  );
  const hasSessionPolicyFailure = SESSION_POLICY_PATTERNS.some((pattern) =>
    lowerMessage.includes(pattern.toLowerCase())
  );

  return hasUserOpValidationFailure && hasSessionPolicyFailure;
}
