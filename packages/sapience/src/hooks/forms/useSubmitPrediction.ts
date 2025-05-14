import { useToast } from '@foil/ui/hooks/use-toast';
import { useCallback, useEffect, useState } from 'react';
import { encodeAbiParameters, parseAbiParameters } from 'viem';
import { useAccount, useTransaction, useWriteContract } from 'wagmi';

import { MarketGroupCategory } from '../graphql/useMarketGroup';
import { EAS_CONTRACT_ADDRESS, SCHEMA_UID } from '~/lib/constants/eas';

// Constant for 2^96 as a BigInt, which is used for sqrt(1) * 2^96
const BIGINT_2_POW_96 = BigInt('79228162514264337593543950336');

interface UseSubmitPredictionProps {
  marketAddress: string;
  marketCategory: MarketGroupCategory;
  submissionValue: string; // Value from the form (e.g. "1.23" for numeric, "marketId" for MCQ, pre-calc sqrtPriceX96 for Yes/No)
  marketId: number; // Specific market ID for the attestation (for MCQ, this is the ID of the chosen option)
}

export function useSubmitPrediction({
  marketAddress,
  marketCategory,
  submissionValue,
  marketId,
}: UseSubmitPredictionProps) {
  const { address } = useAccount();
  const { toast } = useToast();

  const [attestationError, setAttestationError] = useState<string | null>(null);
  const [attestationSuccess, setAttestationSuccess] = useState<string | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);

  const {
    writeContract,
    data: attestData,
    isPending: isAttesting,
    error: writeError,
    reset,
  } = useWriteContract();

  const { data: txReceipt, isSuccess: txSuccess } = useTransaction({
    hash: attestData,
  });

  const encodeSchemaData = useCallback(
    (
      _marketAddress: string,
      _marketId: string,
      predictionInput: string,
      category: MarketGroupCategory
    ) => {
      try {
        let finalPredictionBigInt: bigint;
        const JS_2_POW_96 = 2 ** 96;

        if (category === MarketGroupCategory.NUMERIC) {
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
        } else if (category === MarketGroupCategory.YES_NO) {
          finalPredictionBigInt = BigInt(predictionInput);
        } else if (category === MarketGroupCategory.MULTIPLE_CHOICE) {
          finalPredictionBigInt = BIGINT_2_POW_96;
        } else {
          const _exhaustiveCheck: never = category;
          throw new Error(
            `Unsupported market category for encoding: ${_exhaustiveCheck}`
          );
        }

        return encodeAbiParameters(
          parseAbiParameters(
            'address marketAddress, uint256 marketId, uint160 prediction'
          ),
          [
            _marketAddress as `0x${string}`,
            BigInt(_marketId),
            finalPredictionBigInt,
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
      setIsLoading(true);
      if (!address) {
        throw new Error('Wallet not connected');
      }

      const encodedData = encodeSchemaData(
        marketAddress,
        marketId.toString(),
        submissionValue,
        marketCategory
      );

      writeContract({
        address: EAS_CONTRACT_ADDRESS as `0x${string}`,
        abi: [
          {
            name: 'attest',
            type: 'function',
            stateMutability: 'payable',
            inputs: [
              {
                name: 'request',
                type: 'tuple',
                components: [
                  { name: 'schema', type: 'bytes32' },
                  {
                    name: 'data',
                    type: 'tuple',
                    components: [
                      { name: 'recipient', type: 'address' },
                      { name: 'expirationTime', type: 'uint64' },
                      { name: 'revocable', type: 'bool' },
                      { name: 'refUID', type: 'bytes32' },
                      { name: 'data', type: 'bytes' },
                      { name: 'value', type: 'uint256' },
                    ],
                  },
                ],
              },
            ],
            outputs: [{ name: 'uid', type: 'bytes32' }],
          },
        ],
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
      setIsLoading(false);
      console.error('Attestation submission error:', error);
      setAttestationError(
        error instanceof Error ? error.message : 'Failed to submit prediction'
      );
    }
  }, [
    address,
    marketAddress,
    marketCategory,
    submissionValue,
    marketId,
    encodeSchemaData,
    writeContract,
    reset,
    setAttestationError,
    setAttestationSuccess,
  ]);

  useEffect(() => {
    if (writeError) {
      setIsLoading(false);
      const message = writeError.message.includes('User rejected the request')
        ? 'Transaction rejected by user.'
        : (writeError.cause as Error)?.message ||
          writeError.message ||
          'Prediction submission failed.';
      setAttestationError(message);
      setAttestationSuccess(null);
    }
  }, [writeError, setIsLoading]);

  useEffect(() => {
    if (txSuccess && txReceipt) {
      setIsLoading(false);
      const successMsg = `Prediction submitted successfully! Transaction: ${txReceipt.hash}`;
      setAttestationSuccess(successMsg);
      setAttestationError(null);

      toast({
        title: 'Prediction Submitted',
        description:
          'Your position will appear on this page and your profile shortly.',
        duration: 5000,
      });
    }
  }, [txSuccess, txReceipt, address, toast, setIsLoading]);

  const resetStatus = useCallback(() => {
    setAttestationError(null);
    setAttestationSuccess(null);
  }, []);

  return {
    submitPrediction,
    isAttesting: isAttesting || isLoading,
    attestationError,
    attestationSuccess,
    resetAttestationStatus: resetStatus,
  };
}
