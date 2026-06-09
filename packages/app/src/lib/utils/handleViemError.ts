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
 * We require two conditions:
 * - a user-op/account-validation failure marker from the bundler/paymaster path
 * - a session-policy marker (see below)
 *
 * The user-op marker alone is too broad (any validation failure). For the
 * policy half we deliberately split the markers by confidence:
 *
 * - {@link SESSION_POLICY_NAMED_PATTERNS} are ZeroDev permission-validator revert
 *   names / selectors. Each is an unambiguous session-policy failure on its own.
 * - Generic authorization wording ("not authorized") is NOT trusted on its own:
 *   a called contract's own access control reverts with the exact same words.
 *   We only treat it as a session-policy failure when the message ALSO references
 *   the session itself. Otherwise a stale-session recovery (which tears down the
 *   session and re-prompts the wallet) would fire on unrelated contract reverts.
 */
const USER_OP_VALIDATION_PATTERNS = [
  'AA23',
  'account validation reverted',
  'UserOperation reverted during simulation',
  'user operation reverted during simulation',
] as const;

const SESSION_POLICY_NAMED_PATTERNS = [
  'CallViolatesParamRule',
  'CallViolatesTarget',
  'CallViolatesTargetAddress',
  'CallNotAllowed',
  'TargetNotAllowed',
  '0x59d52e40',
] as const;

const AUTHORIZATION_FAILURE_PATTERNS = [
  'not authorized',
  'not authorised',
] as const;

const SESSION_CONTEXT_PATTERNS = ['session'] as const;

/** Returns true if the error indicates a stale session key policy. */
export function isSessionPolicyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const lowerMessage = message.toLowerCase();
  const includes = (pattern: string) =>
    lowerMessage.includes(pattern.toLowerCase());

  const hasUserOpValidationFailure = USER_OP_VALIDATION_PATTERNS.some(includes);
  if (!hasUserOpValidationFailure) return false;

  const hasNamedPolicyFailure = SESSION_POLICY_NAMED_PATTERNS.some(includes);

  // Generic authorization wording only counts when the message is clearly about
  // the session — not a target contract's own "not authorized" revert.
  const hasSessionScopedAuthFailure =
    AUTHORIZATION_FAILURE_PATTERNS.some(includes) &&
    SESSION_CONTEXT_PATTERNS.some(includes);

  return hasNamedPolicyFailure || hasSessionScopedAuthFailure;
}
