import { useToast } from '@foil/ui/hooks/use-toast';
import { useCallback, useEffect, useState } from 'react';
import { encodeAbiParameters, parseAbiParameters } from 'viem';
import { useAccount, useTransaction, useWriteContract } from 'wagmi';

import type { MarketGroupCategory } from '../graphql/useMarketGroup';
import { EAS_CONTRACT_ADDRESS, SCHEMA_UID } from '~/lib/constants/eas';

interface UseSubmitPredictionProps {
  marketAddress: string;
  marketCategory: MarketGroupCategory;
  submissionValue: string; // N/A indicates invalid
  marketId: number;
}

export function useSubmitPrediction({
  marketAddress,
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
    (_marketAddress: string, _marketId: string, prediction: string) => {
      try {
        return encodeAbiParameters(
          parseAbiParameters(
            'address marketAddress, uint256 marketId, uint160 prediction'
          ),
          [
            _marketAddress as `0x${string}`,
            BigInt(_marketId),
            BigInt(prediction),
          ]
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
      setIsLoading(true);
      if (!address) {
        throw new Error('Wallet not connected');
      }

      // Encode the schema data
      const encodedData = encodeSchemaData(
        marketAddress,
        marketId.toString(),
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
      setIsLoading(false);
      console.error('Attestation submission error:', error);
      setAttestationError(
        error instanceof Error ? error.message : 'Failed to submit prediction'
      );
    }
  }, [
    address,
    marketAddress,
    submissionValue,
    marketId,
    encodeSchemaData,
    writeContract,
    reset, // Add reset dependency
    setAttestationError,
    setAttestationSuccess,
  ]);

  // Effect for handling writeContract error
  useEffect(() => {
    if (writeError) {
      setIsLoading(false);
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
  }, [writeError, setIsLoading]);

  // Effect for handling transaction success and redirect
  useEffect(() => {
    if (txSuccess && txReceipt) {
      setIsLoading(false);
      const successMsg = `Prediction submitted successfully! Transaction: ${txReceipt.hash}`;
      setAttestationSuccess(successMsg);
      setAttestationError(null); // Clear error on success

      toast({
        title: 'Prediction Submitted',
        description:
          'Your position will appear on this page and your profile shortly.',
        duration: 5000,
      });
    }
  }, [txSuccess, txReceipt, address, toast, setIsLoading]);

  // Function to manually reset error/success states if needed externally
  const resetStatus = useCallback(() => {
    setAttestationError(null);
    setAttestationSuccess(null);
  }, []);

  return {
    submitPrediction,
    isAttesting: isAttesting || isLoading,
    attestationError,
    attestationSuccess,
    resetAttestationStatus: resetStatus, // Expose reset function
  };
}
