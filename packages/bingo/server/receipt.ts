// The BingoCardReceipt NFT is the system's database: minting it is the
// durable record of a submission (player, pool, fairness seed, sides, price,
// referrer), and it is the payout rail for bonus/referral transfers. The
// server itself stores nothing — every read here goes to the chain.
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
  parseAbiItem,
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
import { env } from './config.js';
import { NETWORK_CONFIG, type Network } from './network.js';
import { chainFor, getPublicClient, zeroDevUrl } from './session.js';

const receiptAddress = (network: Network): Address =>
  NETWORK_CONFIG[network].receiptContract;

const RECEIPT_ABI = [
  {
    type: 'function',
    name: 'mint',
    stateMutability: 'nonpayable',
    inputs: [
      { type: 'address', name: 'player' },
      { type: 'string', name: 'poolId' },
      { type: 'uint32', name: 'cardIndex' },
      { type: 'bytes32', name: 'seed' },
      { type: 'uint16', name: 'yesMask' },
      { type: 'uint256', name: 'cardPrice' },
      { type: 'address', name: 'referrer' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'cardCount',
    stateMutability: 'view',
    inputs: [
      { type: 'bytes32', name: 'poolHash' },
      { type: 'address', name: 'player' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'tokenOfPlayerPoolIndex',
    stateMutability: 'view',
    inputs: [
      { type: 'bytes32', name: 'poolHash' },
      { type: 'address', name: 'player' },
      { type: 'uint32', name: 'cardIndex' },
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
      { type: 'uint32', name: 'cardIndex' },
      { type: 'uint256', name: 'cardPrice' },
      { type: 'bool', name: 'bonusPaid' },
      { type: 'bool', name: 'referralPaid' },
    ],
  },
  {
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{ type: 'uint256', name: 'tokenId' }],
    outputs: [{ type: 'address' }],
  },
] as const;

const CARD_MINTED_EVENT = parseAbiItem(
  'event CardReceiptMinted(uint256 indexed tokenId, address indexed player, bytes32 indexed poolHash, string poolId, uint32 cardIndex, bytes32 seed, uint16 yesMask, uint256 cardPrice, address referrer)',
);

/** A submission, as recorded on the chain. */
export interface ChainSubmission {
  tokenId: bigint;
  player: Address;
  poolId: string;
  /** Which of the player's cards in this pool (0-based, sequential). */
  cardIndex: number;
  seed: Hex;
  yesMask: number;
  cardPriceWei: string;
  ref: Address | null;
  /** Unix seconds (block timestamp of the mint). */
  submittedAt: number;
  bonusPaid: boolean;
  referralPaid: boolean;
}

type CardMetaTuple = readonly [
  Hex, // poolHash
  Hex, // seed
  Address, // referrer
  bigint, // submittedAt
  number, // yesMask
  number, // cardIndex
  bigint, // cardPrice
  boolean, // bonusPaid
  boolean, // referralPaid
];

const minterClients = new Map<Network, Promise<KernelAccountClient>>();

/** Kernel smart account owned by MINTER_PRIVATE_KEY, sending through the
 *  ZeroDev bundler + paymaster (sponsored gas). Built once per network,
 *  lazily — same key, same smart-account address on both chains. */
function getMinterClient(network: Network): Promise<KernelAccountClient> {
  let p = minterClients.get(network);
  if (!p) {
    p = (async () => {
      const chain = chainFor(network);
      const publicClient = getPublicClient(network);
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
      const url = zeroDevUrl(chain.id);
      const paymasterClient = createZeroDevPaymasterClient({
        chain,
        transport: http(url),
      });
      return createKernelAccountClient({
        account,
        chain,
        bundlerTransport: http(url),
        paymaster: {
          getPaymasterData: async (userOperation) =>
            paymasterClient.sponsorUserOperation({ userOperation }),
        },
      });
    })();
    minterClients.set(network, p);
  }
  return p;
}

/** The minter smart-account address — set this as `minter` on the contract. */
export async function minterAddress(network: Network): Promise<Address> {
  const client = await getMinterClient(network);
  const a = client.account?.address;
  if (!a) throw new Error('Minter client has no account');
  return a;
}

/** A receipt looked up by token id — the public, shareable handle for a
 *  card. `player` is the NFT's current owner (the mintee; also the payout
 *  recipient — the product has no transfer flow). Null if not minted. */
export interface ReceiptLookup {
  player: Address;
  poolHash: Hex;
  seed: Hex;
  yesMask: number;
  cardIndex: number;
  cardPriceWei: string;
  /** Unix seconds. */
  submittedAt: number;
}

export async function receiptLookup(
  network: Network,
  tokenId: bigint,
): Promise<ReceiptLookup | null> {
  const publicClient = getPublicClient(network);
  try {
    const [meta, owner] = await Promise.all([
      publicClient.readContract({
        address: receiptAddress(network),
        abi: RECEIPT_ABI,
        functionName: 'cardMeta',
        args: [tokenId],
      }) as Promise<CardMetaTuple>,
      publicClient.readContract({
        address: receiptAddress(network),
        abi: RECEIPT_ABI,
        functionName: 'ownerOf', // reverts if not minted
        args: [tokenId],
      }) as Promise<Address>,
    ]);
    return {
      player: owner,
      poolHash: meta[0],
      seed: meta[1],
      submittedAt: Number(meta[3]),
      yesMask: meta[4],
      cardIndex: meta[5],
      cardPriceWei: meta[6].toString(),
    };
  } catch {
    return null;
  }
}

export function poolHash(poolId: string): Hex {
  return keccak256(stringToBytes(poolId));
}

/** How many cards the player holds in the pool (= the next mintable
 *  cardIndex; indexes are strictly sequential). */
export async function cardCount(
  network: Network,
  poolId: string,
  player: Address,
): Promise<number> {
  const n = (await getPublicClient(network).readContract({
    address: receiptAddress(network),
    abi: RECEIPT_ABI,
    functionName: 'cardCount',
    args: [poolHash(poolId), player],
  })) as bigint;
  return Number(n);
}

/** The already-minted receipt id for (pool, player, cardIndex), or null. */
export async function receiptTokenId(
  network: Network,
  poolId: string,
  player: Address,
  cardIndex: number,
): Promise<bigint | null> {
  const id = (await getPublicClient(network).readContract({
    address: receiptAddress(network),
    abi: RECEIPT_ABI,
    functionName: 'tokenOfPlayerPoolIndex',
    args: [poolHash(poolId), player, cardIndex],
  })) as bigint;
  return id === 0n ? null : id;
}

/** The chain's record of one (pool, player, cardIndex) submission. */
export async function chainSubmission(
  network: Network,
  poolId: string,
  player: Address,
  cardIndex: number,
): Promise<ChainSubmission | null> {
  const tokenId = await receiptTokenId(network, poolId, player, cardIndex);
  if (tokenId == null) return null;
  const meta = (await getPublicClient(network).readContract({
    address: receiptAddress(network),
    abi: RECEIPT_ABI,
    functionName: 'cardMeta',
    args: [tokenId],
  })) as CardMetaTuple;
  return {
    tokenId,
    player,
    poolId,
    seed: meta[1],
    ref: meta[2] === zeroAddress ? null : meta[2],
    submittedAt: Number(meta[3]),
    yesMask: meta[4],
    cardIndex: meta[5],
    cardPriceWei: meta[6].toString(),
    bonusPaid: meta[7],
    referralPaid: meta[8],
  };
}

/** Every submission ever, from CardReceiptMinted events + current paid
 *  flags. The admin's payout worklist — no server records involved. */
export async function allChainSubmissions(
  network: Network,
): Promise<ChainSubmission[]> {
  const publicClient = getPublicClient(network);
  const logs = await publicClient.getLogs({
    address: receiptAddress(network),
    event: CARD_MINTED_EVENT,
    fromBlock: BigInt(NETWORK_CONFIG[network].logFromBlock),
    toBlock: 'latest',
  });
  return Promise.all(
    logs.map(async (log) => {
      const {
        tokenId,
        player,
        poolId,
        cardIndex,
        seed,
        yesMask,
        cardPrice,
        referrer,
      } = log.args;
      const meta = (await publicClient.readContract({
        address: receiptAddress(network),
        abi: RECEIPT_ABI,
        functionName: 'cardMeta',
        args: [tokenId!],
      })) as CardMetaTuple;
      return {
        tokenId: tokenId!,
        player: player!,
        poolId: poolId!,
        cardIndex: cardIndex!,
        seed: seed!,
        yesMask: yesMask!,
        cardPriceWei: cardPrice!.toString(),
        ref: referrer && referrer !== zeroAddress ? referrer : null,
        submittedAt: Number(meta[3]),
        bonusPaid: meta[7],
        referralPaid: meta[8],
      };
    }),
  );
}

/** Mints the receipt for one (pool, player, cardIndex) — THE act that
 *  records a submission. Idempotent: an existing receipt at that index is
 *  returned as-is, and a lost race re-reads the index once (the contract's
 *  strict-sequential CardIndexMismatch is the backstop). Throws on failure
 *  (no record, no card). */
export async function mintReceipt(params: {
  network: Network;
  player: Address;
  poolId: string;
  cardIndex: number;
  seed: Hex;
  yesMask: number;
  cardPriceWei: string;
  ref: Address | null;
}): Promise<ChainSubmission> {
  const read = () =>
    chainSubmission(
      params.network,
      params.poolId,
      params.player,
      params.cardIndex,
    );
  const existing = await read();
  if (existing) return existing;

  const client = await getMinterClient(params.network);
  const account = client.account;
  if (!account) throw new Error('Minter client has no account');
  try {
    const opHash = await client.sendUserOperation({
      callData: await account.encodeCalls([
        {
          to: receiptAddress(params.network),
          value: 0n,
          data: encodeFunctionData({
            abi: RECEIPT_ABI,
            functionName: 'mint',
            args: [
              params.player,
              params.poolId,
              params.cardIndex,
              params.seed,
              params.yesMask,
              BigInt(params.cardPriceWei),
              params.ref ?? zeroAddress,
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
      `[receipt] minted for ${params.player} pool=${params.poolId} ` +
        `card=${params.cardIndex} ` +
        `tx=${receipt.receipt?.transactionHash ?? opHash}`,
    );
  } catch (e) {
    // Race lost to a concurrent submit of the same index: the receipt now
    // exists, which is all this call was for.
    const racedTo = await read();
    if (racedTo) return racedTo;
    throw e;
  }
  const minted = await read();
  if (!minted) throw new Error('Receipt mint not visible after inclusion');
  return minted;
}
