/**
 * Shared Polygon client helpers for reading Polymarket CTF resolution status.
 * Used by both cleanup-polymarket and settle-polymarket scripts.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  type Transport,
  type Chain,
  type Account,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';
import { conditionalTokensReader } from '@sapience/sdk/contracts/addresses';

export const CONDITIONAL_TOKENS_READER_ADDRESS = (process.env
  .CONDITIONAL_TOKENS_READER_ADDRESS ||
  conditionalTokensReader[137]?.address) as Address;

export const conditionalTokensReaderAbi = [
  {
    type: 'function',
    name: 'canRequestResolution',
    stateMutability: 'view',
    inputs: [{ name: 'conditionId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'getConditionResolution',
    stateMutability: 'view',
    inputs: [{ name: 'conditionId', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'slotCount', type: 'uint256' },
          { name: 'payoutDenominator', type: 'uint256' },
          { name: 'noPayout', type: 'uint256' },
          { name: 'yesPayout', type: 'uint256' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'quoteResolution',
    stateMutability: 'view',
    inputs: [{ name: 'conditionId', type: 'bytes32' }],
    outputs: [
      {
        name: 'fee',
        type: 'tuple',
        components: [
          { name: 'nativeFee', type: 'uint256' },
          { name: 'lzTokenFee', type: 'uint256' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'requestResolution',
    stateMutability: 'payable',
    inputs: [{ name: 'conditionId', type: 'bytes32' }],
    outputs: [],
  },
] as const;

export function createPolygonClient(rpcUrl: string): PublicClient {
  return createPublicClient({
    chain: polygon,
    transport: http(rpcUrl),
  });
}

export function createPolygonWalletClient(
  rpcUrl: string,
  privateKey: string
): WalletClient<Transport, Chain, Account> {
  const formattedKey = privateKey.startsWith('0x')
    ? privateKey
    : `0x${privateKey}`;
  const account = privateKeyToAccount(formattedKey as Hex);
  return createWalletClient({
    account,
    chain: polygon,
    transport: http(rpcUrl),
  });
}

export async function canRequestResolution(
  polygonClient: PublicClient,
  conditionId: string,
  readerAddress: Address = CONDITIONAL_TOKENS_READER_ADDRESS
): Promise<boolean> {
  return polygonClient.readContract({
    address: readerAddress,
    abi: conditionalTokensReaderAbi,
    functionName: 'canRequestResolution',
    args: [conditionId as Hex],
  });
}

/**
 * Batch-check canRequestResolution for multiple conditions using multicall.
 * Sends up to `batchSize` calls per JSON-RPC request via the Multicall3 contract on Polygon.
 * Returns a Map of conditionId → boolean (false on individual call failure).
 */
export async function batchCanRequestResolution(
  polygonClient: PublicClient,
  conditionIds: string[],
  batchSize: number = 50,
  readerAddress: Address = CONDITIONAL_TOKENS_READER_ADDRESS
): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();

  for (let i = 0; i < conditionIds.length; i += batchSize) {
    const batch = conditionIds.slice(i, i + batchSize);
    const contracts = batch.map((id) => ({
      address: readerAddress,
      abi: conditionalTokensReaderAbi,
      functionName: 'canRequestResolution' as const,
      args: [id as Hex],
    }));

    const batchResults = await polygonClient.multicall({ contracts });

    // viem's multicall (allowFailure default) surfaces a dead RPC as N
    // per-call failures rather than a rejected promise. An entire batch
    // failing means the transport or the reader contract is broken — not
    // per-condition state — so raise it instead of silently returning
    // false for everything (which reads as "nothing to settle, 0 errors").
    if (batch.length > 0 && batchResults.every((r) => r.status === 'failure')) {
      const first = batchResults[0];
      const reason =
        first.status === 'failure' && first.error instanceof Error
          ? first.error.message.split('\n')[0]
          : 'unknown error';
      throw new Error(
        `canRequestResolution multicall: every call in the batch failed (${reason})`
      );
    }

    for (let j = 0; j < batch.length; j++) {
      const r = batchResults[j];
      results.set(
        batch[j],
        r.status === 'success' ? (r.result as boolean) : false
      );
    }
  }

  return results;
}

export async function requestResolution(
  polygonClient: PublicClient,
  walletClient: WalletClient<Transport, Chain, Account>,
  conditionId: string,
  readerAddress: Address = CONDITIONAL_TOKENS_READER_ADDRESS
): Promise<`0x${string}`> {
  const fee = await polygonClient.readContract({
    address: readerAddress,
    abi: conditionalTokensReaderAbi,
    functionName: 'quoteResolution',
    args: [conditionId as Hex],
  });

  const nativeFee = fee.nativeFee;
  console.log(`[${conditionId}] LayerZero fee: ${formatEther(nativeFee)} POL`);

  const estimatedGas = await polygonClient.estimateContractGas({
    address: readerAddress,
    abi: conditionalTokensReaderAbi,
    functionName: 'requestResolution',
    args: [conditionId as Hex],
    value: nativeFee,
    account: walletClient.account,
  });
  const gasLimit = (estimatedGas * 130n) / 100n;

  const hash = await walletClient.writeContract({
    address: readerAddress,
    abi: conditionalTokensReaderAbi,
    functionName: 'requestResolution',
    args: [conditionId as Hex],
    value: nativeFee,
    gas: gasLimit,
  });

  return hash;
}
