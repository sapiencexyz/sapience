/**
 * transactionExecutor.ts
 *
 * Pure (non-React) module containing the core transaction execution logic
 * extracted from useSapienceWriteContract. All functions take their dependencies
 * as arguments, making them trivially testable without React or wagmi mocking.
 */
import type { Abi, Hash, Hex } from 'viem';
import { encodeFunctionData } from 'viem';
import { waitForCallsStatus } from 'viem/actions';
import {
  DEFAULT_CHAIN_ID,
  CHAIN_ID_ETHEREAL,
  CHAIN_ID_ETHEREAL_TESTNET,
} from '@sapience/sdk/constants';
import { collateralToken } from '@sapience/sdk/contracts';

// ─── Constants ───────────────────────────────────────────────────────────────

export { DEFAULT_CHAIN_ID };
// deposit() selector: keccak256("deposit()") = 0xd0e30db0
export const WUSDE_DEPOSIT_SELECTOR = '0xd0e30db0' as Hex;

// ─── Types ───────────────────────────────────────────────────────────────────

export type ExecutionPath = 'session' | 'owner' | 'eoa';

export type TransactionCall = {
  to: `0x${string}`;
  data: Hex;
  value: bigint;
};

export interface WriteContractParams {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
  chainId?: number;
}

export interface SessionClient {
  account?: {
    encodeCalls: (calls: TransactionCall[]) => Promise<Hex>;
  };
  sendUserOperation: (params: { callData: Hex }) => Promise<Hash>;
}

export interface SessionConfig {
  expiresAt: number;
}

/** Shape returned by wagmi sendCalls (EIP-5792 or fallback) */
export interface SendCallsResult {
  id?: string;
  receipts?: Array<{ transactionHash?: string }>;
  transactionHash?: string;
  txHash?: string;
}

/** Dependencies injected into executeTransaction (no React required) */
export interface ExecutionDeps {
  // Session path
  sessionClient?: SessionClient | null;
  sessionConfig?: SessionConfig | null;
  needsArbitrumSession?: boolean;
  createArbitrumSessionIfNeeded?: () => Promise<SessionClient | null>;
  executeViaSessionKey?: (
    client: SessionClient,
    calls: TransactionCall[],
    chainId: number
  ) => Promise<Hash>;

  // Owner path
  executeViaOwnerSigning?: (
    calls: TransactionCall[],
    chainId: number
  ) => Promise<Hash>;

  // EOA path
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- wagmi hook return types use complex generics
  writeContractAsync?: (...args: any[]) => Promise<Hash>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- wagmi hook return types use complex generics
  sendCallsAsync?: (params: any) => Promise<SendCallsResult>;
  validateAndSwitchChain?: (chainId: number) => Promise<void>;

  // Lifecycle callbacks
  onTxSending?: () => void;
  onTxSent?: (hash: string) => void;
  onReceiptConfirmed?: () => void;
}

// ─── Pure Functions ──────────────────────────────────────────────────────────

/** Check if a chain ID is an Ethereal chain (mainnet or testnet) */
export function isEtherealChain(chainId: number): boolean {
  return chainId === CHAIN_ID_ETHEREAL || chainId === CHAIN_ID_ETHEREAL_TESTNET;
}

/**
 * Determine execution path based on account mode and session availability.
 *
 * - 'session': Smart account mode with active session (gasless, auto-sign)
 * - 'owner': Smart account mode without session (paymaster-sponsored, user signs as owner)
 * - 'eoa': EOA mode (user's wallet directly, user pays gas)
 */
export function getExecutionPath(
  isUsingSmartAccount: boolean,
  canUseSession: boolean
): ExecutionPath {
  if (!isUsingSmartAccount) return 'eoa';
  if (canUseSession) return 'session';
  return 'owner';
}

/**
 * Encode WriteContractParams into a single TransactionCall.
 */
export function encodeWriteContractToCall(
  params: WriteContractParams
): TransactionCall {
  const { address, abi, functionName, args, value } = params;
  const data = encodeFunctionData({ abi, functionName, args });
  return {
    to: address,
    data,
    value: value ? BigInt(value) : 0n,
  };
}

/**
 * Create a WUSDe deposit (wrap) transaction.
 */
export function createWrapTransaction(
  amount: bigint,
  chainId: number = DEFAULT_CHAIN_ID
): TransactionCall {
  const wusdeAddress =
    collateralToken[chainId]?.address ??
    collateralToken[CHAIN_ID_ETHEREAL]?.address;
  return {
    to: wusdeAddress,
    data: WUSDE_DEPOSIT_SELECTOR,
    value: amount,
  };
}

/**
 * On Ethereal chain, if any call has value > 0, prepend a WUSDe deposit()
 * call with the total value and zero out value on original calls.
 * On other chains, returns calls unchanged.
 */
export function prepareCallsWithWrapping(
  calls: TransactionCall[],
  chainId: number
): TransactionCall[] {
  if (!isEtherealChain(chainId)) return calls;

  const totalValue = calls.reduce((sum, call) => sum + (call.value ?? 0n), 0n);
  if (totalValue === 0n) return calls;

  const wrapTx = createWrapTransaction(totalValue, chainId);
  return [wrapTx, ...calls.map((call) => ({ ...call, value: 0n }))];
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

export function formatSessionError(error: unknown): string {
  if (error instanceof Error) {
    return (
      (error as Error & { shortMessage?: string }).shortMessage || error.message
    );
  }
  return String(error) || 'Session transaction failed';
}

/**
 * Pick the final transaction hash from a potentially complex sendCalls result.
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

// ─── Session Key Execution ───────────────────────────────────────────────────

/**
 * Execute a batch of calls via a session key client.
 * This handles session expiry checks, call encoding, and UserOp submission.
 */
export async function executeViaSessionKeyDefault(
  sessionClient: SessionClient,
  calls: TransactionCall[],
  _chainId: number,
  deps: {
    sessionConfig?: SessionConfig | null;
    onTxSending?: () => void;
    onTxSent?: (hash: string) => void;
    onReceiptConfirmed?: () => void;
  }
): Promise<Hash> {
  // Check session expiration
  if (deps.sessionConfig) {
    const nowMs = Date.now();
    const msRemaining = deps.sessionConfig.expiresAt - nowMs;
    if (nowMs > deps.sessionConfig.expiresAt) {
      throw new Error(
        `Session expired ${Math.abs(msRemaining / 1000 / 60).toFixed(0)} minutes ago. Please end the current session and start a new one.`
      );
    }
  }

  if (!sessionClient.account) {
    throw new Error('Session client account not available');
  }

  const encodedCalls = await sessionClient.account.encodeCalls(calls);
  deps.onTxSending?.();

  const userOpHash = await sessionClient.sendUserOperation({
    callData: encodedCalls,
  });

  deps.onTxSent?.(userOpHash);
  deps.onReceiptConfirmed?.();

  return userOpHash;
}

// ─── Main Execution Engine ───────────────────────────────────────────────────

export interface ExecuteTransactionResult {
  /** Transaction hash (real tx hash or userOp hash, or undefined for session path) */
  hash?: Hash;
  /** Raw result data from sendCalls (EOA batch path) */
  data?: SendCallsResult;
  /** Which execution path was taken */
  path: ExecutionPath;
}

/**
 * Execute a set of transaction calls through the appropriate path.
 *
 * For 'writeContract' style (single call), pass a single-element calls array.
 * For 'sendCalls' style (batch), pass multiple calls.
 *
 * @param calls - Transaction calls to execute
 * @param chainId - Target chain ID
 * @param executionPath - Which path to use ('session' | 'owner' | 'eoa')
 * @param deps - Injectable dependencies (no React required)
 * @param mode - 'writeContract' for single-call wagmi path, 'sendCalls' for batch
 * @param originalArgs - Original wagmi args for EOA fallback (passed through to writeContractAsync/sendCallsAsync)
 */
export async function executeTransaction(
  calls: TransactionCall[],
  chainId: number,
  executionPath: ExecutionPath,
  deps: ExecutionDeps,
  mode: 'writeContract' | 'sendCalls' = 'sendCalls',
  originalArgs?: Record<string, unknown>
): Promise<ExecuteTransactionResult> {
  const wrappedCalls = prepareCallsWithWrapping(calls, chainId);

  // ── Session path ─────────────────────────────────────────────────────
  if (executionPath === 'session') {
    let sessionClient = deps.sessionClient ?? null;

    // Lazy Arbitrum session creation
    if (deps.needsArbitrumSession && deps.createArbitrumSessionIfNeeded) {
      sessionClient = await deps.createArbitrumSessionIfNeeded();
    }

    if (!sessionClient) {
      // Fall through to owner path if session client unavailable
      return executeTransaction(
        calls,
        chainId,
        'owner',
        deps,
        mode,
        originalArgs
      );
    }

    const executeSession =
      deps.executeViaSessionKey ??
      ((c, calls, cid) =>
        executeViaSessionKeyDefault(c, calls, cid, {
          sessionConfig: deps.sessionConfig,
          onTxSending: deps.onTxSending,
          onTxSent: deps.onTxSent,
          onReceiptConfirmed: deps.onReceiptConfirmed,
        }));

    try {
      await executeSession(sessionClient, wrappedCalls, chainId);
      // Don't return userOpHash as hash - it's not a real tx hash
      return { path: 'session' };
    } catch (sessionError: unknown) {
      throw new Error(
        `Session key transaction failed: ${formatSessionError(sessionError)}`
      );
    }
  }

  // ── Owner path ───────────────────────────────────────────────────────
  if (executionPath === 'owner') {
    if (!deps.executeViaOwnerSigning) {
      throw new Error('Owner signing not available');
    }
    try {
      const hash = await deps.executeViaOwnerSigning(wrappedCalls, chainId);
      return { hash, path: 'owner' };
    } catch (ownerError: unknown) {
      throw new Error(
        `Smart account transaction failed: ${formatSessionError(ownerError)}`
      );
    }
  }

  // ── EOA path ─────────────────────────────────────────────────────────
  if (deps.validateAndSwitchChain) {
    await deps.validateAndSwitchChain(chainId);
  }

  if (mode === 'writeContract' && deps.writeContractAsync) {
    // Single-call writeContract path
    // If Ethereal with value, needs wrapping via sendCalls batch
    if (isEtherealChain(chainId) && calls.length === 1 && calls[0].value > 0n) {
      if (!deps.sendCallsAsync) {
        throw new Error(
          'sendCallsAsync required for Ethereal wrapping in EOA mode'
        );
      }
      const result = await deps.sendCallsAsync({
        chainId,
        calls: wrappedCalls,
        experimental_fallback: true,
      });
      const txHash = pickFinalTransactionHash(result);
      return { hash: txHash as Hash | undefined, data: result, path: 'eoa' };
    }

    // Simple single call - use writeContractAsync directly
    const hash = await deps.writeContractAsync(originalArgs);
    return { hash, path: 'eoa' };
  }

  // Batch sendCalls path
  if (!deps.sendCallsAsync) {
    throw new Error('sendCallsAsync not available');
  }

  const data = await deps.sendCallsAsync({
    ...(originalArgs ?? {}),
    experimental_fallback: true,
  });

  return { data, path: 'eoa' };
}
