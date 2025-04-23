import { useToast } from '@foil/ui/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { encodeAbiParameters, parseAbiParameters } from 'viem';
import { useAccount, useWriteContract, useTransaction } from 'wagmi';

import type { PredictionMarketType } from '~/components/forecasting/PredictionForm';
import { EAS_CONTRACT_ADDRESS, SCHEMA_UID } from '~/lib/constants/eas';

interface UseSubmitPredictionProps {
  marketData: PredictionMarketType | null | undefined;
  submissionValue: string | number; // N/A indicates invalid
  selectedMarketId: string | number | null;
}

export function useSubmitPrediction({
  marketData,
  submissionValue,
  selectedMarketId,
}: UseSubmitPredictionProps) {
  const { address } = useAccount();
  const router = useRouter();
  const { toast } = useToast();

  const [attestationError, setAttestationError] = useState<string | null>(null);
  const [attestationSuccess, setAttestationSuccess] = useState<string | null>(
    null
  );

  // EAS contract write hook
  const {
    writeContract,
    data: attestData,
    isPending: isAttesting,
    error: writeError,
    reset, // Add reset function
  } = useWriteContract();

  // Wait for transaction
  const { data: txReceipt, isSuccess: txSuccess } = useTransaction({
    hash: attestData,
  });

  // Helper function to encode schema data
  const encodeSchemaData = useCallback(
    (marketAddress: string, marketId: string, prediction: string) => {
      try {
        return encodeAbiParameters(
          parseAbiParameters(
            'address marketAddress, uint256 marketId, uint160 prediction'
          ),
          [marketAddress as `0x${string}`, BigInt(marketId), BigInt(prediction)]
        );
      } catch (error) {
        console.error('Error encoding schema data:', error);
        throw new Error('Failed to encode prediction data');
      }
    },
    []
  );

  // Main submission function exposed by the hook
  const submitPrediction = useCallback(async () => {
    // Reset previous states before attempting
    setAttestationError(null);
    setAttestationSuccess(null);
    reset(); // Reset wagmi write state

    try {
      if (!address) {
        throw new Error('Wallet not connected');
      }
      if (!marketData?.address) {
        throw new Error('Market address not available');
      }
      if (
        submissionValue === 'N/A' ||
        typeof submissionValue !== 'string' || // Ensure it's the string format expected by EAS
        !selectedMarketId
      ) {
        console.error(
          'Attempted to submit prediction with invalid value or market ID.',
          { submissionValue, selectedMarketId }
        );
        throw new Error('Cannot submit prediction with the current input.');
      }

      const finalMarketId = selectedMarketId.toString();

      // Encode the schema data
      const encodedData = encodeSchemaData(
        marketData.address,
        finalMarketId,
        submissionValue // Pass the validated string value
      );

      // Submit the attestation
      writeContract({
        address: EAS_CONTRACT_ADDRESS as `0x${string}`,
        abi: [
          // ... (Keep ABI definition as it was) ...
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
      console.error('Attestation submission error:', error);
      setAttestationError(
        error instanceof Error ? error.message : 'Failed to submit prediction'
      );
    }
  }, [
    address,
    marketData,
    submissionValue,
    selectedMarketId,
    encodeSchemaData,
    writeContract,
    reset, // Add reset dependency
    setAttestationError,
    setAttestationSuccess,
  ]);

  // Effect for handling writeContract error
  useEffect(() => {
    if (writeError) {
      // Extract user-friendly error message if possible
      const message = writeError.message.includes('User rejected the request')
        ? 'Transaction rejected by user.'
        : (writeError.cause as Error)?.message ||
          writeError.message ||
          'Prediction submission failed.';
      setAttestationError(message);
      // Clear success message on new error
      setAttestationSuccess(null);
    }
  }, [writeError]);

  // Effect for handling transaction success and redirect
  useEffect(() => {
    if (txSuccess && txReceipt) {
      const successMsg = `Prediction submitted successfully! Transaction: ${txReceipt.hash}`;
      setAttestationSuccess(successMsg);
      setAttestationError(null); // Clear error on success

      toast({
        title: 'Prediction Submitted',
        description: 'Your position will appear on your profile shortly.',
        duration: 5000,
      });

      // Redirect after a short delay to allow toast visibility
      const timer = setTimeout(() => {
        if (address) {
          router.push(`/profile/${address}`);
        }
      }, 1000); // 1 second delay

      return () => clearTimeout(timer); // Cleanup timer
    }
  }, [txSuccess, txReceipt, address, router, toast]);

  // Function to manually reset error/success states if needed externally
  const resetStatus = useCallback(() => {
    setAttestationError(null);
    setAttestationSuccess(null);
  }, []);

  return {
    submitPrediction,
    isAttesting,
    attestationError,
    attestationSuccess,
    resetAttestationStatus: resetStatus, // Expose reset function
  };
}
