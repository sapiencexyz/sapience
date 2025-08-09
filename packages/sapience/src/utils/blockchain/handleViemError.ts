import { BaseError } from 'viem';

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
