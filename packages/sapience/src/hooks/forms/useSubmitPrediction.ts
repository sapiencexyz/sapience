import { useToast } from '@sapience/ui/hooks/use-toast';
import { useCallback } from 'react';
import type { Address } from 'viem';
import { useAccount, useWriteContract } from 'wagmi';

import type { MarketGroupClassification } from '../../lib/types';
import { CONVERGE_SCHEMA_UID } from '~/lib/constants/eas';
import {
  getEASContractAddress,
  EAS_ATTEST_ABI,
  encodeEASAttest,
} from '~/utils/contracts/EAS';
import { useTransactionState } from '~/hooks/blockchain/useTransactionState';
import { handleViemError } from '~/utils/blockchain/handleViemError';
import { useMonitorTxStatus } from '~/hooks/blockchain/useMonitorTxStatus';
import { useChainValidation } from '~/hooks/blockchain/useChainValidation';

interface UseSubmitPredictionProps {
  marketChainId: number;
  marketAddress: string;
  marketClassification: MarketGroupClassification;
  submissionValue: string; // Value from the form (e.g. "1.23" for numeric, "marketId" for MCQ, pre-calc sqrtPriceX96 for Yes/No)
  marketId: number; // Specific market ID for the attestation (for MCQ, this is the ID of the chosen option)
  comment?: string; // Optional comment field
  onSuccess?: () => void; // Callback for successful submission
}

export function useSubmitPrediction({
  marketChainId,
  marketAddress,
  marketClassification,
  submissionValue,
  marketId,
  comment = '',
  onSuccess,
}: UseSubmitPredictionProps) {
  const { address: _address } = useAccount();
  const { toast } = useToast();

  const EAS_CONTRACT_ADDRESS = getEASContractAddress(marketChainId);

  const {
    state,
    setLoading,
    setTxHash,
    reset: resetState,
  } = useTransactionState();

  const {
    writeContract,
    isPending: isAttesting,
    reset,
  } = useWriteContract({
    mutation: {
      onSuccess: setTxHash,
      onError: (error: Error) => {
        toast({
          title: 'Transaction Failed',
          description: handleViemError(error, 'Transaction failed.'),
          duration: 5000,
        });
      },
    },
  });

  // Memoize callbacks to prevent useMonitorTxStatus from re-running effects
  const handleTxSuccess = useCallback(() => {
    toast({
      title: 'Prediction Submitted',
      description:
        'Your position will appear on this page and your profile shortly.',
      duration: 5000,
    });
    // Call the optional onSuccess callback
    onSuccess?.();
  }, [toast, onSuccess]);

  const handleTxError = useCallback(
    (error: Error) => {
      toast({
        title: 'Transaction Failed',
        description: handleViemError(error, 'Transaction failed.'),
        duration: 5000,
        variant: 'destructive',
      });
    },
    [toast]
  );

  useMonitorTxStatus({
    hash: state.txHash,
    chainId: marketChainId,
    onLoading: setLoading,
    onSuccess: handleTxSuccess,
    onError: handleTxError,
  });

  // Memoize chain validation error callback
  const handleChainError = useCallback(() => {
    toast({
      title: 'Chain Validation Failed',
      description: 'Please switch to the correct chain.',
      duration: 5000,
      variant: 'destructive',
    });
  }, [toast]);

  const { validateAndSwitchChain } = useChainValidation({
    targetChainId: marketChainId,
    onError: handleChainError,
    onLoading: setLoading,
  });

  const submitPrediction = useCallback(async () => {
    resetState();
    reset();

    try {
      setLoading(true);

      // Validate chain and switch if necessary
      await validateAndSwitchChain();

      // If we are here, the chain is correct.
      const encodedData = encodeEASAttest({
        marketAddress: marketAddress as Address,
        marketId: marketId.toString(),
        predictionInput: submissionValue,
        classification: marketClassification,
        comment,
      });

      writeContract({
        chainId: marketChainId,
        address: EAS_CONTRACT_ADDRESS,
        abi: EAS_ATTEST_ABI,
        functionName: 'attest',
        args: [
          {
            schema: CONVERGE_SCHEMA_UID as `0x${string}`,
            data: {
              recipient:
                '0x0000000000000000000000000000000000000000' as `0x${string}`,
              expirationTime: BigInt(0),
              revocable: false,
              refUID:
                '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
              data: encodedData,
              value: BigInt(0),
            },
          },
        ],
      });
    } catch (error) {
      toast({
        title: 'Failed to submit prediction',
        description: handleViemError(
          error as Error,
          'Failed to submit prediction'
        ),
        duration: 5000,
      });
    }
  }, [
    marketAddress,
    marketClassification,
    submissionValue,
    marketId,
    comment,
    writeContract,
    reset,
    validateAndSwitchChain,
    resetState,
    setLoading,
    toast,
    marketChainId,
    EAS_CONTRACT_ADDRESS,
  ]);

  return {
    submitPrediction,
    isAttesting: isAttesting || state.isLoading,
  };
}
