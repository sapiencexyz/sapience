'use client';

import { useCallback, useState } from 'react';
import { encodeFunctionData, type Abi, type Hash } from 'viem';
import { useSession } from '~/lib/context/SessionContext';
import { ethereal } from '~/lib/session/sessionKeyManager';
import { arbitrum } from 'viem/chains';

interface WriteContractParams {
  chainId: number;
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
}

interface UseSessionWriteContractResult {
  /**
   * Execute a contract write via session key if active, otherwise returns null.
   * Returns the transaction hash on success.
   */
  writeContractViaSession: (params: WriteContractParams) => Promise<Hash | null>;

  /**
   * Check if a session is active and can handle the given chain.
   */
  canUseSession: (chainId: number) => boolean;

  /**
   * Whether a transaction is currently pending.
   */
  isPending: boolean;

  /**
   * Any error from the last transaction attempt.
   */
  error: Error | null;
}

/**
 * Hook to execute contract writes via ZeroDev session keys.
 *
 * If a session is active and supports the target chain, transactions will be
 * executed via the Kernel client (UserOperation). Otherwise, returns null
 * indicating the caller should fall back to regular transaction flow.
 */
export function useSessionWriteContract(): UseSessionWriteContractResult {
  const { isSessionActive, chainClients, sessionConfig } = useSession();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const canUseSession = useCallback(
    (chainId: number): boolean => {
      if (!isSessionActive || !sessionConfig) return false;

      // Check if session has expired
      if (Date.now() > sessionConfig.expiresAt) return false;

      // Check if we have a client for this chain
      if (chainId === ethereal.id && chainClients.ethereal) return true;
      if (chainId === arbitrum.id && chainClients.arbitrum) return true;

      return false;
    },
    [isSessionActive, sessionConfig, chainClients]
  );

  const writeContractViaSession = useCallback(
    async (params: WriteContractParams): Promise<Hash | null> => {
      const { chainId, address, abi, functionName, args, value } = params;

      // Check if we can use session for this chain
      if (!canUseSession(chainId)) {
        return null;
      }

      // Get the appropriate client
      const client =
        chainId === ethereal.id
          ? chainClients.ethereal
          : chainId === arbitrum.id
            ? chainClients.arbitrum
            : null;

      if (!client) {
        return null;
      }

      setIsPending(true);
      setError(null);

      try {
        // Encode the function call
        const data = encodeFunctionData({
          abi,
          functionName,
          args: args as any,
        });

        // Create the call data for the UserOperation
        const callData = await client.account.encodeCalls([
          {
            to: address,
            data,
            value: value ?? BigInt(0),
          },
        ]);

        // Send the UserOperation
        const userOpHash = await client.sendUserOperation({
          callData,
        });

        // Wait for the transaction receipt
        const receipt = await client.waitForUserOperationReceipt({
          hash: userOpHash,
        });

        return receipt.receipt.transactionHash;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Transaction failed');
        setError(error);
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    [canUseSession, chainClients]
  );

  return {
    writeContractViaSession,
    canUseSession,
    isPending,
    error,
  };
}

/**
 * Send multiple calls in a batch via session key.
 */
export function useSessionSendCalls() {
  const { isSessionActive, chainClients, sessionConfig } = useSession();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const canUseSession = useCallback(
    (chainId: number): boolean => {
      if (!isSessionActive || !sessionConfig) return false;
      if (Date.now() > sessionConfig.expiresAt) return false;
      if (chainId === ethereal.id && chainClients.ethereal) return true;
      if (chainId === arbitrum.id && chainClients.arbitrum) return true;
      return false;
    },
    [isSessionActive, sessionConfig, chainClients]
  );

  const sendCallsViaSession = useCallback(
    async (params: {
      chainId: number;
      calls: Array<{ to: `0x${string}`; data: `0x${string}`; value?: bigint }>;
    }): Promise<Hash | null> => {
      const { chainId, calls } = params;

      if (!canUseSession(chainId)) {
        return null;
      }

      const client =
        chainId === ethereal.id
          ? chainClients.ethereal
          : chainId === arbitrum.id
            ? chainClients.arbitrum
            : null;

      if (!client) {
        return null;
      }

      setIsPending(true);
      setError(null);

      try {
        // Encode all calls
        const callData = await client.account.encodeCalls(
          calls.map((call) => ({
            to: call.to,
            data: call.data,
            value: call.value ?? BigInt(0),
          }))
        );

        // Send the UserOperation
        const userOpHash = await client.sendUserOperation({
          callData,
        });

        // Wait for the transaction receipt
        const receipt = await client.waitForUserOperationReceipt({
          hash: userOpHash,
        });

        return receipt.receipt.transactionHash;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Transaction failed');
        setError(error);
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    [canUseSession, chainClients]
  );

  return {
    sendCallsViaSession,
    canUseSession,
    isPending,
    error,
  };
}
