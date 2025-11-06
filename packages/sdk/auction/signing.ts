import {
  encodeAbiParameters,
  keccak256,
  getAddress,
  type Address,
  type Hex,
  type TypedDataDomain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export interface AuctionStartLike {
  // On-chain quantity in wei; accepts bigint for safety, or string for convenience
  wager: bigint | string;
  // Pre-encoded outcomes bytes. Only the first element is used because the relayer
  // provides a single aggregated blob containing all legs. Additional elements are ignored.
  predictedOutcomes: Hex[]; // bytes[] (non-empty expected)
  resolver: Address;
  maker: Address;
}

export function buildTakerBidTypedData(args: {
  auction: AuctionStartLike;
  takerWager: bigint;
  // Accept bigint for timestamp to avoid precision issues; number remains supported
  takerDeadline: bigint | number;
  chainId: number;
  verifyingContract: Address;
  taker: Address;
}): {
  domain: TypedDataDomain;
  types: { Approve: readonly [
    { name: 'messageHash'; type: 'bytes32' },
    { name: 'owner'; type: 'address' },
  ] };
  primaryType: 'Approve';
  message: { messageHash: Hex; owner: Address };
} {
  if (args.auction.predictedOutcomes.length === 0) {
    throw new Error('predictedOutcomes must be non-empty');
  }

  // NOTE: Only the first element is used intentionally. The relayer encodes all legs
  // into a single bytes blob at index 0 for compatibility with the on-chain verifier.
  const encodedPredictedOutcomes = args.auction.predictedOutcomes[0];

  const inner = encodeAbiParameters(
    [
      { type: 'bytes' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'address' },
      { type: 'address' },
      { type: 'uint256' },
    ],
    [
      encodedPredictedOutcomes,
      args.takerWager,
      typeof args.auction.wager === 'bigint' ? args.auction.wager : BigInt(args.auction.wager),
      args.auction.resolver,
      args.auction.maker,
      typeof args.takerDeadline === 'bigint' ? args.takerDeadline : BigInt(args.takerDeadline),
    ],
  );

  const messageHash = keccak256(inner);

  const domain = {
    name: 'SignatureProcessor',
    version: '1',
    chainId: args.chainId,
    verifyingContract: args.verifyingContract,
  } as const;

  const types = {
    Approve: [
      { name: 'messageHash', type: 'bytes32' },
      { name: 'owner', type: 'address' },
    ] as const,
  } as const satisfies { Approve: readonly [
    { name: 'messageHash'; type: 'bytes32' },
    { name: 'owner'; type: 'address' },
  ] };

  const message = {
    messageHash,
    owner: getAddress(args.taker),
  } as const;

  // NOTE: The primaryType 'Approve' is required for compatibility with the on-chain
  // SignatureProcessor. Renaming this will change the struct hash and invalidate signatures.
  return {
    domain,
    types,
    primaryType: 'Approve',
    message,
  };
}

export async function signTakerBid(args: {
  privateKey: Hex;
  domain: TypedDataDomain;
  types: { Approve: readonly [
    { name: 'messageHash'; type: 'bytes32' },
    { name: 'owner'; type: 'address' },
  ] };
  primaryType: 'Approve';
  message: { messageHash: Hex; owner: Address };
}): Promise<Hex> {
  const account = privateKeyToAccount(args.privateKey);
  const signature = (await account.signTypedData({
    domain: args.domain,
    types: args.types,
    primaryType: args.primaryType,
    message: args.message,
  })) as Hex;
  return signature;
}


