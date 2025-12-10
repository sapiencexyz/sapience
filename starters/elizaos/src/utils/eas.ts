import { elizaLogger } from "@elizaos/core";
import {
  encodeAbiParameters,
  encodeFunctionData,
  parseAbiParameters,
  type Address,
} from "viem";

type Hex = `0x${string}`;

// EAS contract on Arbitrum (the only supported chain)
const EAS_ADDRESS_ARBITRUM: Address = "0xbD75f629A22Dc1ceD33dDA0b68c546A1c035c458";
const ARBITRUM_CHAIN_ID = 42161;

// UMA Resolver on Arbitrum (default resolver for conditions)
const UMA_RESOLVER_ARBITRUM: Address = "0x2cc1311871b9fc7bfcb809c75da4ba25732eafb9";

// Forecast schema: address resolver, bytes condition, uint256 forecast, string comment
const SCHEMA_ID: Hex =
  "0x7df55bcec6eb3b17b25c503cc318a36d33b0a9bbc2d6bc0d9788f9bd61980d49";

// EAS ABI for attestation
const EAS_ABI = [
  {
    name: "attest",
    type: "function",
    inputs: [
      {
        name: "request",
        type: "tuple",
        components: [
          { name: "schema", type: "bytes32" },
          {
            name: "data",
            type: "tuple",
            components: [
              { name: "recipient", type: "address" },
              { name: "expirationTime", type: "uint64" },
              { name: "revocable", type: "bool" },
              { name: "refUID", type: "bytes32" },
              { name: "data", type: "bytes" },
              { name: "value", type: "uint256" },
            ],
          },
        ],
      },
    ],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "payable",
  },
] as const;

export type ForecastCalldata = {
  to: Address;
  data: Hex;
  value: "0";
  chainId: 42161;
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

/**
 * Convert probability (0-100) to D18 format
 * D18 means 18 decimal places, so 50% = 50 * 10^18
 */
function probabilityToD18(prob: number): bigint {
  return BigInt(Math.round(prob * 1e18));
}

/**
 * Decode probability from D18 format back to 0-100
 */
export function decodeProbabilityFromD18(value: string): number | null {
  try {
    const forecastBigInt = BigInt(value);
    const probability = Number(forecastBigInt) / 1e18;
    return Math.max(0, Math.min(100, probability));
  } catch {
    return null;
  }
}

/**
 * Build calldata for submitting a forecast attestation to Arbitrum EAS.
 *
 * @param resolver - The resolver contract address (defaults to UMA resolver on Arbitrum)
 * @param condition - The condition data as bytes (typically the conditionId)
 * @param probability - Probability 0-100 that the condition resolves YES
 * @param comment - Optional comment/reasoning (max 180 chars, will be truncated)
 */
export function buildForecastCalldata(
  resolver: Address,
  condition: Hex,
  probability: number,
  comment?: string,
): ForecastCalldata {
  if (probability < 0 || probability > 100) {
    throw new Error(`Probability must be between 0 and 100, got ${probability}`);
  }

  const truncatedComment = comment
    ? comment.length > 180
      ? `${comment.substring(0, 177)}...`
      : comment
    : "";

  const encodedData = encodeAbiParameters(
    parseAbiParameters(
      "address resolver, bytes condition, uint256 forecast, string comment",
    ),
    [
      resolver,
      condition,
      probabilityToD18(probability),
      truncatedComment,
    ],
  );

  const attestationRequest = {
    schema: SCHEMA_ID,
    data: {
      recipient: ZERO_ADDRESS,
      expirationTime: 0n,
      revocable: false,
      refUID: ZERO_BYTES32,
      data: encodedData as Hex,
      value: 0n,
    },
  } as const;

  const calldata = encodeFunctionData({
    abi: EAS_ABI,
    functionName: "attest",
    args: [attestationRequest],
  });

  return {
    to: EAS_ADDRESS_ARBITRUM,
    data: calldata as Hex,
    value: "0",
    chainId: ARBITRUM_CHAIN_ID,
  };
}

/**
 * Get the default UMA resolver address for Arbitrum
 */
export function getDefaultResolver(): Address {
  return UMA_RESOLVER_ARBITRUM;
}

// ============================================================================
// Legacy API (wrapper for backwards compatibility)
// ============================================================================

interface Prediction {
  probability: number;
  reasoning: string;
  confidence: number;
}

export interface AttestationCalldata {
  to: string;
  data: string;
  value: string;
  chainId: number;
  description: string;
}

/** @deprecated Use buildForecastCalldata instead */
export async function buildAttestationCalldata(
  prediction: Prediction,
  _chainId: number = 42161,
  conditionId?: `0x${string}`,
): Promise<AttestationCalldata | null> {
  try {
    const condition = conditionId || ("0x" as Hex);
    const calldata = buildForecastCalldata(
      UMA_RESOLVER_ARBITRUM,
      condition,
      prediction.probability,
      prediction.reasoning,
    );

    return {
      to: calldata.to,
      data: calldata.data,
      value: calldata.value,
      chainId: calldata.chainId,
      description: `Attest: ${prediction.probability}% YES`,
    };
  } catch (error) {
    elizaLogger.error("Error building attestation calldata:", error);
    return null;
  }
}
