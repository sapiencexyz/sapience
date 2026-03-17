import {
  encodeAbiParameters,
  encodeFunctionData,
  parseAbiParameters,
  zeroAddress,
} from 'viem';
import type { Address, Hex } from 'viem';
import { submitTransaction } from './tx';
import { eas } from '../contracts/addresses';
import { CHAIN_ID_ARBITRUM } from '../constants/chain';
import { EAS_ABI, EAS_SCHEMA_ID } from './sharedAbis';

/** Probability value constrained to 0-100 */
export type Probability = number & { readonly __brand: 'Probability' };

/** Create a validated Probability value (0-100) */
export function probability(value: number): Probability {
  if (value < 0 || value > 100) {
    throw new Error(`Probability must be between 0 and 100, got ${value}`);
  }
  return value as Probability;
}

// EAS contract on Arbitrum
const EAS_ADDRESS_ARBITRUM: Address = eas[CHAIN_ID_ARBITRUM].address as Address;
const ARBITRUM_CHAIN_ID = CHAIN_ID_ARBITRUM;

const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;

/**
 * Convert probability (0-100) to D18 format
 * D18 means 18 decimal places, so 50% = 50 * 10^18
 */
function probabilityToD18(prob: number): bigint {
  // prob is 0-100, so multiply by 10^18
  return BigInt(Math.round(prob * 1e18));
}

export type ForecastCalldata = {
  to: Address;
  data: Hex;
  value: '0';
  chainId: 42161;
};

/**
 * Build calldata for submitting a forecast attestation to Arbitrum EAS.
 *
 * @param resolver - The resolver contract address
 * @param condition - The condition data (bytes)
 * @param probability - Probability 0-100 that the condition resolves YES
 * @param comment - Optional comment/reasoning (max 180 chars, will be truncated)
 */
export function buildForecastCalldata(
  resolver: Address,
  condition: Hex,
  prob: number,
  comment?: string
): ForecastCalldata {
  if (prob < 0 || prob > 100) {
    throw new Error(`Probability must be between 0 and 100, got ${prob}`);
  }

  const truncatedComment = comment
    ? comment.length > 180
      ? `${comment.substring(0, 177)}...`
      : comment
    : '';

  const encodedData = encodeAbiParameters(
    parseAbiParameters(
      'address resolver, bytes condition, uint256 forecast, string comment'
    ),
    [resolver, condition, probabilityToD18(prob), truncatedComment]
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

  return {
    to: EAS_ADDRESS_ARBITRUM,
    data: calldata as Hex,
    value: '0',
    chainId: ARBITRUM_CHAIN_ID,
  };
}

/**
 * Submit a forecast attestation to Arbitrum EAS.
 *
 * This is the main entry point for agents to submit forecasts.
 * Always submits to Arbitrum mainnet.
 *
 * @param resolver - The resolver contract address
 * @param condition - The condition data (bytes)
 * @param probability - Probability 0-100 that the condition resolves YES
 * @param comment - Optional comment/reasoning (max 180 chars)
 * @param privateKey - Wallet private key for signing
 * @param rpc - Arbitrum RPC URL (defaults to public endpoint)
 *
 * @example
 * ```ts
 * const { hash } = await submitForecast({
 *   resolver: '0x1234...abcd',
 *   condition: '0x...',
 *   probability: 75,
 *   comment: 'High confidence based on recent polling data',
 *   privateKey: '0x...',
 * });
 * ```
 */
export async function submitForecast(args: {
  resolver: Address;
  condition: Hex;
  probability: number;
  comment?: string;
  privateKey: Hex;
  rpc?: string;
}): Promise<{ hash: Hex; calldata: ForecastCalldata }> {
  const calldata = buildForecastCalldata(
    args.resolver,
    args.condition,
    args.probability,
    args.comment
  );

  const rpc = args.rpc || 'https://arb1.arbitrum.io/rpc';

  const { hash } = await submitTransaction({
    rpc,
    privateKey: args.privateKey,
    tx: { to: calldata.to, data: calldata.data, value: calldata.value },
  });

  return { hash, calldata };
}
