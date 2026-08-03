/**
 * transactionExecutor.ts
 *
 * Pure (non-React) module for resolving the settled transaction hash from an
 * EIP-5792 batch submission. Dependencies are passed as arguments, making these
 * functions trivially testable without React or wagmi mocking.
 */
import { waitForCallsStatus } from 'viem/actions';

export interface SendCallsResult {
  id?: string;
  receipts?: Array<{ transactionHash?: string }>;
  transactionHash?: string;
  txHash?: string;
}

/**
 * Pick the final transaction hash out of a batch result, preferring the last
 * receipt (the call that actually settles the batch).
 */
export function pickFinalTransactionHash(
  data: SendCallsResult | null | undefined
): string | undefined {
  const receipts = data?.receipts;
  if (Array.isArray(receipts) && receipts.length > 0) {
    for (let i = receipts.length - 1; i >= 0; i--) {
      const h = receipts?.[i]?.transactionHash;
      if (typeof h === 'string' && h.length > 0) return h;
    }
  }
  if (typeof data?.transactionHash === 'string') return data.transactionHash;
  if (typeof data?.txHash === 'string') return data.txHash;
  return undefined;
}

/**
 * Resolve a final transaction hash from an EIP-5792 sendCalls result.
 * If the result contains a call bundle ID and a client is available,
 * polls for bundle status. Returns the resolved hash or undefined.
 */
export async function resolveEoaBatchResult(
  data: SendCallsResult | null | undefined,
  client?: unknown
): Promise<string | undefined> {
  try {
    if (data?.id && client) {
      // Cast: client is a viem Client from useConnectorClient; kept as unknown
      // to avoid coupling this module to wagmi's specific Client subtype.
      const status = await waitForCallsStatus(
        client as Parameters<typeof waitForCallsStatus>[0],
        { id: data.id }
      );
      return pickFinalTransactionHash(status as SendCallsResult);
    }
    return pickFinalTransactionHash(data);
  } catch (error) {
    console.error('[resolveEoaBatchResult] Failed to resolve tx hash:', error);
    return undefined;
  }
}
