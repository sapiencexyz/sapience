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
  conditionId: string
): Promise<boolean> {
  return polygonClient.readContract({
    address: CONDITIONAL_TOKENS_READER_ADDRESS,
    abi: conditionalTokensReaderAbi,
    functionName: 'canRequestResolution',
    args: [conditionId as Hex],
  });
}

export async function requestResolution(
  polygonClient: PublicClient,
  walletClient: WalletClient<Transport, Chain, Account>,
  conditionId: string
): Promise<`0x${string}`> {
  const fee = await polygonClient.readContract({
    address: CONDITIONAL_TOKENS_READER_ADDRESS,
    abi: conditionalTokensReaderAbi,
    functionName: 'quoteResolution',
    args: [conditionId as Hex],
  });

  const nativeFee = fee.nativeFee;
  console.log(`[${conditionId}] LayerZero fee: ${formatEther(nativeFee)} POL`);

  const estimatedGas = await polygonClient.estimateContractGas({
    address: CONDITIONAL_TOKENS_READER_ADDRESS,
    abi: conditionalTokensReaderAbi,
    functionName: 'requestResolution',
    args: [conditionId as Hex],
    value: nativeFee,
    account: walletClient.account,
  });
  const gasLimit = (estimatedGas * 130n) / 100n;

  const hash = await walletClient.writeContract({
    address: CONDITIONAL_TOKENS_READER_ADDRESS,
    abi: conditionalTokensReaderAbi,
    functionName: 'requestResolution',
    args: [conditionId as Hex],
    value: nativeFee,
    gas: gasLimit,
  });

  return hash;
}
