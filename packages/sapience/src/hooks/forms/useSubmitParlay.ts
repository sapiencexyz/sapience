import { useToast } from '@sapience/ui/hooks/use-toast';
import { useCallback, useState, useMemo, useEffect } from 'react';
import { encodeFunctionData, erc20Abi } from 'viem';
import {
  useAccount,
  useSwitchChain,
  useSendCalls,
  useCallsStatus,
} from 'wagmi';

// Contract addresses
const PARLAY_CONTRACT_ADDRESS = '0xb2d82FAd2847D839773fa226CB094eb195f88abF';
const COLLATERAL_TOKEN_ADDRESS = '0x211cc4dd073734da055fbf44a2b4667d5e5fe5d2';

// Parlay contract ABI (only the functions we need)
const PARLAY_ABI = [
  {
    type: 'function',
    name: 'submitParlayOrder',
    inputs: [
      {
        name: 'predictedOutcomes',
        type: 'tuple[]',
        components: [
          {
            name: 'market',
            type: 'tuple',
            components: [
              {
                name: 'marketGroup',
                type: 'address',
              },
              {
                name: 'marketId',
                type: 'uint256',
              },
            ],
          },
          {
            name: 'prediction',
            type: 'bool',
          },
        ],
      },
      {
        name: 'collateral',
        type: 'uint256',
      },
      {
        name: 'payout',
        type: 'uint256',
      },
      {
        name: 'orderExpirationTime',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: 'requestId',
        type: 'uint256',
      },
    ],
    stateMutability: 'nonpayable',
  },
] as const;

interface ParlayPosition {
  marketAddress: string;
  marketId: number;
  prediction: boolean;
  limit: string; // Amount in string format
}

interface UseSubmitParlayProps {
  chainId: number;
  positions: ParlayPosition[];
  wagerAmount: string; // Total wager amount for the parlay (collateral)
  payoutAmount: string; // Expected payout amount
  orderExpirationHours?: number; // Hours from now when order expires (default: 24)
  onSuccess?: () => void;
  enabled?: boolean;
}

export function useSubmitParlay({
  chainId,
  positions,
  wagerAmount,
  payoutAmount,
  orderExpirationHours = 24,
  onSuccess,
  enabled = true,
}: UseSubmitParlayProps) {
  const { address, chainId: currentChainId } = useAccount();
  const { toast } = useToast();

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { switchChainAsync } = useSwitchChain();

  // Parse amounts to bigint
  const parsedWagerAmount = useMemo(() => {
    try {
      return BigInt(wagerAmount || '0');
    } catch {
      return BigInt(0);
    }
  }, [wagerAmount]);

  const parsedPayoutAmount = useMemo(() => {
    try {
      return BigInt(payoutAmount || '0');
    } catch {
      return BigInt(0);
    }
  }, [payoutAmount]);

  // Calculate order expiration time (current time + hours in seconds)
  const orderExpirationTime = useMemo(() => {
    return BigInt(
      Math.floor(Date.now() / 1000) + orderExpirationHours * 60 * 60
    );
  }, [orderExpirationHours]);

  // Prepare calls for sendCalls
  const calls = useMemo(() => {
    const callsArray: { to: `0x${string}`; data: `0x${string}` }[] = [];

    // Validate inputs
    if (
      positions.length === 0 ||
      parsedWagerAmount <= 0 ||
      parsedPayoutAmount <= 0
    ) {
      return callsArray;
    }

    // Add ERC20 approval call for collateral token
    const approveCalldata = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [PARLAY_CONTRACT_ADDRESS, parsedWagerAmount],
    });

    callsArray.push({
      to: COLLATERAL_TOKEN_ADDRESS,
      data: approveCalldata,
    });

    // Transform positions to match contract structure
    const predictedOutcomes = positions.map((position) => ({
      market: {
        marketGroup: position.marketAddress as `0x${string}`,
        marketId: BigInt(position.marketId),
      },
      prediction: position.prediction,
    }));

    // Add submitParlayOrder call
    const submitParlayCalldata = encodeFunctionData({
      abi: PARLAY_ABI,
      functionName: 'submitParlayOrder',
      args: [
        predictedOutcomes,
        parsedWagerAmount,
        parsedPayoutAmount,
        orderExpirationTime,
      ],
    });

    callsArray.push({
      to: PARLAY_CONTRACT_ADDRESS,
      data: submitParlayCalldata,
    });

    return callsArray;
  }, [positions, parsedWagerAmount, parsedPayoutAmount, orderExpirationTime]);

  // Use the useSendCalls hook
  const {
    sendCalls,
    data: sendCallsId,
    isPending: isSendCallsPending,
    error: sendCallsError,
    reset: resetSendCalls,
  } = useSendCalls();

  // Monitor the calls status
  const {
    data: callsStatus,
    isSuccess: isCallsSuccess,
    error: callsStatusError,
  } = useCallsStatus({
    id: sendCallsId?.id || '',
    query: {
      enabled: !!sendCallsId?.id,
    },
  });

  const submitParlay = useCallback(async () => {
    if (!enabled || !address || positions.length === 0) {
      return;
    }

    setError(null);
    setSuccess(null);
    resetSendCalls();

    try {
      // Check if we need to switch chains
      if (currentChainId !== chainId) {
        if (!switchChainAsync) {
          throw new Error('Chain switching not available');
        }

        try {
          await switchChainAsync({ chainId });
        } catch (switchError) {
          const message =
            switchError instanceof Error &&
            switchError.message.includes('User rejected')
              ? 'Network switch rejected by user'
              : 'Failed to switch network';

          throw new Error(message);
        }
      }

      // Validate calls
      if (calls.length === 0) {
        throw new Error('No valid calls to execute');
      }

      toast({
        title: 'Submitting Parlay Order',
        description:
          'Please confirm the transaction batch in your wallet. This will approve collateral and submit your parlay order.',
      });

      // Submit the batch of calls using the useSendCalls hook
      sendCalls({
        calls,
        chainId,
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to submit parlay';
      setError(errorMessage);

      toast({
        title: 'Parlay Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  }, [
    enabled,
    address,
    positions.length,
    currentChainId,
    chainId,
    switchChainAsync,
    calls,
    resetSendCalls,
    sendCalls,
    toast,
  ]);

  // Handle sendCalls error
  useEffect(() => {
    if (sendCallsError) {
      const message = sendCallsError.message.includes('User rejected')
        ? 'Transaction rejected by user'
        : sendCallsError.message || 'Transaction failed';
      setError(message);

      toast({
        title: 'Transaction Failed',
        description: message,
        variant: 'destructive',
      });
    }
  }, [sendCallsError, toast]);

  // Handle successful calls submission and completion
  useEffect(() => {
    if (isCallsSuccess && callsStatus?.status === 'success') {
      const successMsg = `Parlay order submitted successfully! Batch ID: ${sendCallsId?.id}`;
      setSuccess(successMsg);
      setError(null);

      toast({
        title: 'Parlay Order Confirmed',
        description:
          'Your parlay order has been submitted and is available for other users to fill',
        duration: 5000,
      });

      onSuccess?.();
    }
  }, [isCallsSuccess, callsStatus, sendCallsId, toast, onSuccess]);

  // Handle calls status error
  useEffect(() => {
    if (callsStatusError) {
      setError('Failed to confirm transaction');

      toast({
        title: 'Transaction Failed',
        description: 'The transaction failed to confirm on the blockchain',
        variant: 'destructive',
      });
    }
  }, [callsStatusError, toast]);

  const reset = useCallback(() => {
    setError(null);
    setSuccess(null);
    resetSendCalls();
  }, [resetSendCalls]);

  return {
    submitParlay,
    isSubmitting: isSendCallsPending,
    error,
    success,
    reset,
    sendCallsId,
    callsStatus,
  };
}
