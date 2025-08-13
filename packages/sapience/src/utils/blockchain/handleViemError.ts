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
