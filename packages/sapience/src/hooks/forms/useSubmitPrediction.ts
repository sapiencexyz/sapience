import { useCallback, useState } from 'react';
import { encodeAbiParameters, parseAbiParameters, type Hash } from 'viem';
import { useAccount } from 'wagmi';

import { MarketGroupClassification } from '../../lib/types';
import { SCHEMA_UID } from '~/lib/constants/eas';
import { EAS_ATTEST_ABI, getEASContractAddress } from '~/hooks/contract/EAS';
import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';

// Default to Arbitrum; anticipate most transactions occur on Arbitrum.
// If a market requires a different chain in the future, thread that chainId in via hook params.
const ARBITRUM_CHAIN_ID = 42161;

interface UseSubmitPredictionProps {
  marketAddress: string;
  marketClassification: MarketGroupClassification;
  submissionValue: string; // Value from the form (e.g. "1.23" for numeric, "marketId" for MCQ, pre-calc sqrtPriceX96 for Yes/No)
  marketId: number; // Specific market ID for the attestation (for MCQ, this is the ID of the chosen option)
  comment?: string; // Optional comment field
  onSuccess?: () => void; // Callback for successful submission
}

export function useSubmitPrediction({
  marketAddress,
  marketClassification,
  submissionValue,
  marketId,
  comment = '',
  onSuccess,
}: UseSubmitPredictionProps) {
  const { address } = useAccount();

  const [attestationError, setAttestationError] = useState<string | null>(null);
  const [attestationSuccess, setAttestationSuccess] = useState<string | null>(
    null
  );
  const [txHash, setTxHash] = useState<Hash | undefined>(undefined);
  const {
    writeContract,
    isPending: isAttesting,
    reset,
  } = useSapienceWriteContract({
    successMessage:
      'Your forecast will appear on this page and your profile shortly.',
    fallbackErrorMessage: 'Forecast submission failed.',
    onTxHash: (hash) => setTxHash(hash),
    onSuccess: () => {
      const successMsg = txHash
        ? `Prediction submitted successfully! Transaction: ${txHash}`
        : 'Prediction submitted successfully!';
      setAttestationSuccess(successMsg);
      setAttestationError(null);
      onSuccess?.();
      setTxHash(undefined);
    },
    onError: (error) => {
      setAttestationError(error.message || 'Prediction submission failed.');
      setAttestationSuccess(null);
      setTxHash(undefined);
    },
  });

  const encodeSchemaData = useCallback(
    (
      _marketAddress: string,
      _marketId: string,
      predictionInput: string,
      classification: MarketGroupClassification,
      _comment: string
    ) => {
      try {
        let finalPredictionBigInt: bigint;
        const JS_2_POW_96 = 2 ** 96;

        switch (classification) {
          case MarketGroupClassification.NUMERIC: {
            console.log('predictionInput numeric', predictionInput);
            const inputNum = parseFloat(predictionInput);
            if (Number.isNaN(inputNum) || inputNum < 0) {
              throw new Error(
                'Numeric prediction input must be a valid non-negative number.'
              );
            }
            const effectivePrice = inputNum * 10 ** 18;
            const sqrtEffectivePrice = Math.sqrt(effectivePrice);
            const sqrtPriceX96Float = sqrtEffectivePrice * JS_2_POW_96;
            finalPredictionBigInt = BigInt(Math.round(sqrtPriceX96Float));
            break;
          }
          case MarketGroupClassification.YES_NO:
            console.log('predictionInput yes no', predictionInput);
            finalPredictionBigInt = BigInt(predictionInput);
            break;
          case MarketGroupClassification.MULTIPLE_CHOICE:
            console.log('predictionInput multiple choice', predictionInput);
            finalPredictionBigInt = BigInt(predictionInput);
            break;
          default: {
            // This will catch any unhandled enum members at compile time
            const _exhaustiveCheck: never = classification;
            throw new Error(
              `Unsupported market classification for encoding: ${_exhaustiveCheck}`
            );
          }
        }

        return encodeAbiParameters(
          parseAbiParameters(
            'address marketAddress, uint256 marketId, bytes32 questionId, uint160 prediction, string comment'
          ),
          [
            _marketAddress as `0x${string}`,
            BigInt(_marketId),
            `0x0000000000000000000000000000000000000000000000000000000000000000` as `0x${string}`, // TODO: fix this, it is a stub!
            finalPredictionBigInt,
            _comment,
          ]
        );
      } catch (error) {
        console.error('Error encoding schema data:', error);
        if (
          error instanceof Error &&
          (error.message.includes('Numeric prediction input must be') ||
            error.message.includes('Unsupported market category'))
        ) {
          throw error;
        }
        throw new Error('Failed to encode prediction data');
      }
    },
    []
  );

  const submitPrediction = useCallback(async () => {
    setAttestationError(null);
    setAttestationSuccess(null);
    reset();

    try {
      if (!address) {
        throw new Error('Wallet not connected. Please connect your wallet.');
      }
      const encodedData = encodeSchemaData(
        marketAddress,
        marketId.toString(),
        submissionValue,
        marketClassification,
        comment
      );
      await writeContract({
        chainId: ARBITRUM_CHAIN_ID,
        address: getEASContractAddress(ARBITRUM_CHAIN_ID),
        abi: EAS_ATTEST_ABI,
        functionName: 'attest',
        args: [
          {
            schema: SCHEMA_UID as `0x${string}`,
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
      console.error('Attestation submission error:', error);
      setAttestationError(
        error instanceof Error ? error.message : 'Failed to submit prediction'
      );
    }
  }, [
    address,
    marketAddress,
    marketClassification,
    submissionValue,
    marketId,
    comment,
    encodeSchemaData,
    writeContract,
    reset,
    setAttestationError,
    setAttestationSuccess,
  ]);

  const resetStatus = useCallback(() => {
    setAttestationError(null);
    setAttestationSuccess(null);
  }, []);

  return {
    submitPrediction,
    isAttesting,
    attestationError,
    attestationSuccess,
    resetAttestationStatus: resetStatus,
  };
}
