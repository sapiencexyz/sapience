import { useCallback } from 'react';
import type { Address } from 'viem';

import type { MarketGroupClassification } from '../../lib/types';
import { CONVERGE_SCHEMA_UID } from '~/lib/constants/eas';
import {
  getEASContractAddress,
  EAS_ATTEST_ABI,
  encodeEASAttest,
} from '~/hooks/contract/EAS';
import { useSapiensWriteContract } from '~/hooks/blockchain/useSapiensWriteContract';

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
  const EAS_CONTRACT_ADDRESS = getEASContractAddress(marketChainId);

  const { writeContract, isPending, txHash } = useSapiensWriteContract({
    onSuccess,
    successMessage:
      'Your position will appear on this page and your profile shortly.',
    fallbackErrorMessage: 'Failed to submit prediction',
  });

  const submitPrediction = useCallback(async () => {
    const encodedData = encodeEASAttest({
      marketAddress: marketAddress as Address,
      marketId: marketId.toString(),
      predictionInput: submissionValue,
      classification: marketClassification,
      comment,
    });

    await writeContract({
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
  }, [
    marketAddress,
    marketClassification,
    submissionValue,
    marketId,
    comment,
    writeContract,
    EAS_CONTRACT_ADDRESS,
    marketChainId,
  ]);

  return {
    submitPrediction,
    isAttesting: isPending,
    txHash,
  };
}
