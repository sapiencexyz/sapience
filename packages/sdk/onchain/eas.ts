import {
  encodeAbiParameters,
  encodeFunctionData,
  parseAbiParameters,
  zeroAddress,
} from 'viem';
import type { Address, Hex } from 'viem';
import { contracts } from '../contracts/addresses';
import { CHAIN_ID_ARBITRUM } from '../constants/chain';
import { EAS_ABI, EAS_SCHEMA_ID } from './sharedAbis';

export type AttestationCalldata = {
  to: Address;
  data: Hex;
  value: string;
  chainId: number;
  description: string;
};

/**
 * Decode probability from D18 format
 * D18 means 18 decimal places, so 50 * 10^18 = 50%
 */
export function decodeProbabilityFromD18(value: string): number | null {
  try {
    const predictionBigInt = BigInt(value);
    // Divide by 10^18 to get probability 0-100
    const probability = Number(predictionBigInt) / 1e18;
    return Math.max(0, Math.min(100, probability));
  } catch {
    return null;
  }
}

export async function buildAttestationCalldata(
  prediction: { probability: number; reasoning: string; confidence: number },
  chainId: number = CHAIN_ID_ARBITRUM,
  resolver?: Address,
  condition?: Hex
): Promise<AttestationCalldata | null> {
  const ZERO_BYTES32 =
    '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;
  const EMPTY_BYTES = '0x' as Hex;

  const encodedData = encodeAbiParameters(
    parseAbiParameters(
      'address resolver, bytes condition, uint256 forecast, string comment'
    ),
    [
      resolver || zeroAddress,
      condition || EMPTY_BYTES,
      BigInt(Math.round(prediction.probability * 1e18)), // D18 format
      prediction.reasoning.length > 180
        ? `${prediction.reasoning.substring(0, 177)}...`
        : prediction.reasoning,
    ]
  );

  const attestationRequest = {
    schema: EAS_SCHEMA_ID,
    data: {
      recipient: zeroAddress,
      expirationTime: 0n,
      revocable: false,
      refUID: ZERO_BYTES32,
      data: encodedData as Hex,
      value: 0n,
    },
  } as const;

  const calldata = encodeFunctionData({
    abi: EAS_ABI,
    functionName: 'attest',
    args: [attestationRequest],
  });

  // EAS addresses live in contracts/addresses.ts for consistency with the repo
  const easAddress = contracts.eas?.[chainId]?.address as Address | undefined;
  if (!easAddress) {
    return null;
  }

  return {
    to: easAddress,
    data: calldata as Hex,
    value: '0',
    chainId,
    description: `Attest: ${prediction.probability}% YES`,
  };
}
