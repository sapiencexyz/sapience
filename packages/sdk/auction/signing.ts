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
  taker: Address;
}

export function buildMakerBidTypedData(args: {
  auction: AuctionStartLike;
  makerWager: bigint;
  // Accept bigint for timestamp to avoid precision issues; number remains supported
  makerDeadline: bigint | number;
  chainId: number;
  verifyingContract: Address;
  maker: Address;
  makerNonce: bigint;
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
      { type: 'uint256' },
    ],
    [
      encodedPredictedOutcomes,
      args.makerWager,
      typeof args.auction.wager === 'bigint' ? args.auction.wager : BigInt(args.auction.wager),
      args.auction.resolver,
      args.auction.taker,
      typeof args.makerDeadline === 'bigint' ? args.makerDeadline : BigInt(args.makerDeadline),
      args.makerNonce,
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
    owner: getAddress(args.maker),
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

export async function signMakerBid(args: {
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

// ============================================================================
// Taker Auction Start Signing (EIP-191 / SIWE format)
// ============================================================================

export interface AuctionStartSigningPayload {
  wager: string; // wei string
  predictedOutcomes: string[]; // Array of bytes strings
  resolver: string; // contract address
  taker: string; // EOA address
  takerNonce: number; // nonce
  chainId: number; // chain ID
}

/**
 * Auction request payload sent to the relayer WebSocket server.
 * This matches the relayer's AuctionRequestPayload type.
 * The takerSignature and takerSignedAt fields are optional for price discovery,
 * but required when submitting a quote request that needs signature verification.
 */
export interface AuctionRequestPayload {
  wager: string; // wei string
  predictedOutcomes: string[]; // Array of bytes strings that the resolver validates/understands
  resolver: string; // contract address for market validation
  taker: string; // EOA address of the taker initiating the auction
  takerNonce: number; // nonce for the taker
  chainId: number; // chain ID for the auction (e.g., 42161 for Arbitrum)
  takerSignature?: string; // EIP-191 signature of the taker (optional for price discovery)
  takerSignedAt?: string; // ISO timestamp when the signature was created (required if takerSignature is provided)
}

/**
 * Creates a SIWE-formatted message for auction request signing (EIP-191)
 * This follows EIP-4361 format and includes all auction parameters in the signature
 * @param payload - Auction parameters to sign
 * @param domain - The domain (e.g., 'api.sapience.xyz')
 * @param uri - The URI (e.g., 'https://api.sapience.xyz')
 * @param issuedAt - ISO timestamp when the signature was created
 * @returns The SIWE-formatted message string
 */
export function createAuctionStartSiweMessage(
  payload: AuctionStartSigningPayload,
  domain: string,
  uri: string,
  issuedAt: string
): string {
  const nonce = payload.takerNonce.toString();

  // Create a compact statement that includes all auction-specific parameters
  // This ensures wager, predictedOutcomes, and resolver are part of the signature
  const statement = `Sign to get a quote | Wager: ${payload.wager} | Outcomes: ${payload.predictedOutcomes.join(',')} | Resolver: ${payload.resolver}`;

  // Manually construct the SIWE message following EIP-4361 format
  // Must be exactly 6 lines to avoid parser validation issues
  // Format: domain+address, statement, URI+Version, Chain ID, Nonce, Issued At
  const preparedMessage = [
    `${domain} wants you to sign in with your Ethereum account:\n${payload.taker}`,
    statement,
    `URI: ${uri}\nVersion: 1`,
    `Chain ID: ${payload.chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`
  ].join('\n');

  return preparedMessage;
}

/**
 * Extracts domain and URI from a WebSocket URL for SIWE signing
 * @param wsUrl - WebSocket URL (e.g., 'wss://relayer.sapience.xyz/auction')
 * @returns { domain, uri } for SIWE message
 */
export function extractSiweDomainAndUri(wsUrl: string): {
  domain: string;
  uri: string;
} {
  try {
    const url = new URL(wsUrl);
    const domain = url.hostname;
    // Use origin instead of full URL to keep URI short but we need to change the protocol to https for the SIWE message (EIP-4361 requirement)
    const protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    const uri = `${protocol}//${url.host}`;
    return { domain, uri };
  } catch (err) {
    // Fallback for invalid URLs
    console.error('[AuctionSigning] Invalid WebSocket URL:', wsUrl, err);
    return { domain: 'unknown', uri: 'https://unknown' };
  }
}

