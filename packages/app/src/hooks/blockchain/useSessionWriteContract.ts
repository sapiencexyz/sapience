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
  writeContractViaSession: (
    params: WriteContractParams
  ) => Promise<Hash | null>;
  canUseSession: (chainId: number) => boolean;
  isPending: boolean;
  error: Error | null;
}

interface SendCallsParams {
  chainId: number;
  calls: Array<{ to: `0x${string}`; data: `0x${string}`; value?: bigint }>;
}

interface UseSessionSendCallsResult {
  sendCallsViaSession: (params: SendCallsParams) => Promise<Hash | null>;
  canUseSession: (chainId: number) => boolean;
  isPending: boolean;
  error: Error | null;
}

/**
 * Get the session client for a given chain ID.
 */
function getClientForChain(
  chainId: number,
  chainClients: { ethereal: unknown; arbitrum: unknown }
) {
  if (chainId === ethereal.id) return chainClients.ethereal;
  if (chainId === arbitrum.id) return chainClients.arbitrum;
  return null;
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
      if (Date.now() > sessionConfig.expiresAt) return false;
      if (chainId === ethereal.id && chainClients.ethereal) return true;
      if (chainId === arbitrum.id && chainClients.arbitrum) return true;
      return false;
    },
    [isSessionActive, sessionConfig, chainClients]
  );

  const writeContractViaSession = useCallback(
    async (params: WriteContractParams): Promise<Hash | null> => {
      const { chainId, address, abi, functionName, args, value } = params;

      if (!canUseSession(chainId)) {
        return null;
      }

      const client = getClientForChain(chainId, chainClients) as any;
      if (!client) {
        return null;
      }

      setIsPending(true);
      setError(null);

      try {
        const data = encodeFunctionData({
          abi,
          functionName,
          args: args as any,
        });

        const callData = await client.account.encodeCalls([
          { to: address, data, value: value ?? BigInt(0) },
        ]);

        const userOpHash = await client.sendUserOperation({ callData });
        const receipt = await client.waitForUserOperationReceipt({
          hash: userOpHash,
        });

        return receipt.receipt.transactionHash;
      } catch (err) {
        const sessionError =
          err instanceof Error ? err : new Error('Transaction failed');
        setError(sessionError);
        throw sessionError;
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
export function useSessionSendCalls(): UseSessionSendCallsResult {
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
    async (params: SendCallsParams): Promise<Hash | null> => {
      const { chainId, calls } = params;

      if (!canUseSession(chainId)) {
        return null;
      }

      const client = getClientForChain(chainId, chainClients) as any;
      if (!client) {
        return null;
      }

      setIsPending(true);
      setError(null);

      try {
        const formattedCalls = calls.map((call) => ({
          to: call.to,
          data: call.data,
          value: call.value ?? BigInt(0),
        }));

        const callData = await client.account.encodeCalls(formattedCalls);
        const userOpHash = await client.sendUserOperation({ callData });
        const receipt = await client.waitForUserOperationReceipt({
          hash: userOpHash,
        });

        return receipt.receipt.transactionHash;
      } catch (err) {
        const sessionError =
          err instanceof Error ? err : new Error('Transaction failed');
        setError(sessionError);
        throw sessionError;
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
