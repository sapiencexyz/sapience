import { useCallback, useState } from 'react';
import { encodeAbiParameters, parseAbiParameters, type Hash } from 'viem';
import { useAccount } from 'wagmi';

import { SCHEMA_UID } from '~/lib/constants';
import { EAS_ATTEST_ABI, EAS_CONTRACT_ADDRESS } from '~/hooks/contract/EAS';
import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';
import { CHAIN_ID_ARBITRUM } from '@sapience/sdk/constants';

interface UseSubmitPredictionProps {
  submissionValue: string; // Value from the form - probability 0-100 (will be converted to D18)
  comment?: string;
  onSuccess?: () => void;
  resolver: `0x${string}`;
  condition: `0x${string}`;
}

export function useSubmitPrediction({
  submissionValue,
  comment = '',
  onSuccess,
  resolver,
  condition,
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
    redirectProfileAnchor: 'forecasts',
  });

  const encodeSchemaData = useCallback(
    (
      predictionInput: string,
      _comment: string,
      _resolver: `0x${string}`,
      _condition: `0x${string}`
    ) => {
      try {
        const finalPredictionBigInt = BigInt(
          Math.round(parseFloat(predictionInput) * 1e18)
        );

        return encodeAbiParameters(
          parseAbiParameters(
            'address resolver, bytes condition, uint256 forecast, string comment'
          ),
          [_resolver, _condition, finalPredictionBigInt, _comment]
        );
      } catch (error) {
        console.error('Error encoding schema data:', error);
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
        submissionValue,
        comment,
        resolver,
        condition
      );
      await writeContract({
        chainId: CHAIN_ID_ARBITRUM,
        address: EAS_CONTRACT_ADDRESS,
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
    submissionValue,
    comment,
    resolver,
    condition,
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
