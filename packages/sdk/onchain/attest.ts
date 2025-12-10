import { encodeAbiParameters, encodeFunctionData, parseAbiParameters } from 'viem';
import type { Address } from 'viem';
import { submitTransaction } from './tx';

type Hex = `0x${string}`;

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
const EAS_ADDRESS_ARBITRUM: Address = '0xbD75f629A22Dc1ceD33dDA0b68c546A1c035c458';
const ARBITRUM_CHAIN_ID = 42161;

// EAS schema id for forecast attestations
// Schema: address resolver, bytes condition, uint256 forecast, string comment
const SCHEMA_ID: Hex =
  '0x7df55bcec6eb3b17b25c503cc318a36d33b0a9bbc2d6bc0d9788f9bd61980d49';

// EAS ABI (attest)
const EAS_ABI = [
  {
    name: 'attest',
    type: 'function',
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
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'payable',
  },
] as const;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;
const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;

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
  comment?: string,
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
      'address resolver, bytes condition, uint256 forecast, string comment',
    ),
    [
      resolver,
      condition,
      probabilityToD18(prob),
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
    args.comment,
  );

  const rpc = args.rpc || 'https://arb1.arbitrum.io/rpc';

  const { hash } = await submitTransaction({
    rpc,
    privateKey: args.privateKey,
    tx: { to: calldata.to, data: calldata.data, value: calldata.value },
  });

  return { hash, calldata };
}

