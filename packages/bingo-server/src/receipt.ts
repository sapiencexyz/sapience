// Mints the BingoCardReceipt NFT for a submitted card: the on-chain record
// of (player, pool, fairness seed, sides, price, referrer) and the payout
// rail for bonus/referral transfers. Optional — disabled unless the contract
// address and minter key are configured.
//
// The minter is a ZeroDev kernel smart account owned by MINTER_PRIVATE_KEY,
// and mints go through the same bundler + paymaster the player sessions use —
// one gas-funding channel for the whole system, no native-gas EOA to keep
// topped up. Set the SMART ACCOUNT address (logged at boot) as the
// contract's minter, not the EOA.

import {
  encodeFunctionData,
  http,
  keccak256,
  stringToBytes,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
  type KernelAccountClient,
} from '@zerodev/sdk';
import { signerToEcdsaValidator } from '@zerodev/ecdsa-validator';
import { getEntryPoint, KERNEL_V3_1 } from '@zerodev/sdk/constants';
import { etherealTestnetChain } from '@sapience/sdk/constants';
import { env } from './config.js';
import { CHAIN_ID, getPublicClient, zeroDevUrl } from './session.js';
import type { CardSubmission } from './types.js';

const RECEIPT_ABI = [
  {
    type: 'function',
    name: 'mint',
    stateMutability: 'nonpayable',
    inputs: [
      { type: 'address', name: 'player' },
      { type: 'string', name: 'poolId' },
      { type: 'bytes32', name: 'seed' },
      { type: 'uint16', name: 'yesMask' },
      { type: 'uint256', name: 'cardPrice' },
      { type: 'address', name: 'referrer' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'tokenOfPlayerPool',
    stateMutability: 'view',
    inputs: [
      { type: 'bytes32', name: 'poolHash' },
      { type: 'address', name: 'player' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'cardMeta',
    stateMutability: 'view',
    inputs: [{ type: 'uint256', name: 'tokenId' }],
    outputs: [
      { type: 'bytes32', name: 'poolHash' },
      { type: 'bytes32', name: 'seed' },
      { type: 'address', name: 'referrer' },
      { type: 'uint64', name: 'submittedAt' },
      { type: 'uint16', name: 'yesMask' },
      { type: 'uint256', name: 'cardPrice' },
      { type: 'bool', name: 'bonusPaid' },
      { type: 'bool', name: 'referralPaid' },
    ],
  },
] as const;

export function receiptEnabled(): boolean {
  return !!env.RECEIPT_CONTRACT_ADDRESS && !!env.MINTER_PRIVATE_KEY;
}

let minterClientPromise: Promise<KernelAccountClient> | null = null;

/** Kernel smart account owned by MINTER_PRIVATE_KEY, sending through the
 *  ZeroDev bundler + paymaster (sponsored gas). Built once, lazily. */
function getMinterClient(): Promise<KernelAccountClient> {
  if (!minterClientPromise) {
    minterClientPromise = (async () => {
      const publicClient = getPublicClient();
      const signer = privateKeyToAccount(env.MINTER_PRIVATE_KEY as Hex);
      const entryPoint = getEntryPoint('0.7');
      const validator = await signerToEcdsaValidator(publicClient, {
        signer,
        entryPoint,
        kernelVersion: KERNEL_V3_1,
      });
      const account = await createKernelAccount(publicClient, {
        entryPoint,
        plugins: { sudo: validator },
        kernelVersion: KERNEL_V3_1,
      });
      const url = zeroDevUrl(CHAIN_ID);
      const paymasterClient = createZeroDevPaymasterClient({
        chain: etherealTestnetChain,
        transport: http(url),
      });
      return createKernelAccountClient({
        account,
        chain: etherealTestnetChain,
        bundlerTransport: http(url),
        paymaster: {
          getPaymasterData: async (userOperation) =>
            paymasterClient.sponsorUserOperation({ userOperation }),
        },
      });
    })();
  }
  return minterClientPromise;
}

/** The minter smart-account address — set this as `minter` on the contract. */
export async function minterAddress(): Promise<Address | null> {
  if (!receiptEnabled()) return null;
  const client = await getMinterClient();
  return client.account?.address ?? null;
}

/** On-chain payout state from the receipt NFT, or null when there is no
 *  receipt (contract disabled or not yet minted). */
export async function receiptPaidState(
  poolId: string,
  player: Address,
): Promise<{
  tokenId: bigint;
  bonusPaid: boolean;
  referralPaid: boolean;
} | null> {
  const tokenId = await receiptTokenId(poolId, player);
  if (tokenId == null) return null;
  const meta = (await getPublicClient().readContract({
    address: env.RECEIPT_CONTRACT_ADDRESS as Address,
    abi: RECEIPT_ABI,
    functionName: 'cardMeta',
    args: [tokenId],
  })) as readonly [
    Hex,
    Hex,
    Address,
    bigint,
    number,
    bigint,
    boolean,
    boolean,
  ];
  return { tokenId, bonusPaid: meta[6], referralPaid: meta[7] };
}

/** The already-minted receipt for (pool, player), or null. */
export async function receiptTokenId(
  poolId: string,
  player: Address,
): Promise<bigint | null> {
  if (!env.RECEIPT_CONTRACT_ADDRESS) return null;
  const id = (await getPublicClient().readContract({
    address: env.RECEIPT_CONTRACT_ADDRESS as Address,
    abi: RECEIPT_ABI,
    functionName: 'tokenOfPlayerPool',
    args: [keccak256(stringToBytes(poolId)), player],
  })) as bigint;
  return id === 0n ? null : id;
}

/** Idempotently mints the receipt for a submission. Failures are logged, not
 *  thrown — the receipt is the public record, not a gate on play. */
export async function ensureReceiptMinted(
  sub: CardSubmission,
  seed: Hex,
): Promise<void> {
  if (!receiptEnabled()) return;
  try {
    const existing = await receiptTokenId(sub.poolId, sub.player);
    if (existing != null) return;

    const client = await getMinterClient();
    const account = client.account;
    if (!account) throw new Error('Minter client has no account');
    const opHash = await client.sendUserOperation({
      callData: await account.encodeCalls([
        {
          to: env.RECEIPT_CONTRACT_ADDRESS as Address,
          value: 0n,
          data: encodeFunctionData({
            abi: RECEIPT_ABI,
            functionName: 'mint',
            args: [
              sub.player,
              sub.poolId,
              seed,
              sub.yesMask,
              BigInt(sub.cardPriceWei),
              sub.ref ?? zeroAddress,
            ],
          }),
        },
      ]),
    });
    const receipt = await client.waitForUserOperationReceipt({ hash: opHash });
    if (!receipt.success) {
      throw new Error(
        `Receipt mint reverted${receipt.reason ? `: ${receipt.reason}` : ''}`,
      );
    }
    console.log(
      `[receipt] minted for ${sub.player} pool=${sub.poolId} ` +
        `tx=${receipt.receipt?.transactionHash ?? opHash}`,
    );
  } catch (e) {
    console.error(
      `[receipt] mint failed for ${sub.player} pool=${sub.poolId}:`,
      e,
    );
  }
}
