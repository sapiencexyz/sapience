import {
  encodeAbiParameters,
  hashTypedData,
  keccak256,
  type Address,
  type Hex,
  type TypedDataDomain,
} from 'viem';

// ============================================================================
// EIP-712 Domain & Types
// ============================================================================

/**
 * EIP-712 domain for SecondaryMarketEscrow
 * Matches: EIP712("SecondaryMarketEscrow", "1")
 */
export function getSecondaryDomain(
  verifyingContract: Address,
  chainId: number
): TypedDataDomain {
  return {
    name: 'SecondaryMarketEscrow',
    version: '1',
    chainId: BigInt(chainId),
    verifyingContract,
  };
}

/**
 * EIP-712 types for TradeApproval
 * Matches SecondaryMarketEscrow.TRADE_APPROVAL_TYPEHASH:
 * keccak256("TradeApproval(bytes32 tradeHash,address signer,uint256 nonce,uint256 deadline)")
 */
export const TRADE_APPROVAL_TYPES = {
  TradeApproval: [
    { name: 'tradeHash', type: 'bytes32' },
    { name: 'signer', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

// ============================================================================
// Hash Computation
// ============================================================================

/**
 * Compute tradeHash for secondary market signatures
 *
 * Mirrors `SecondaryMarketEscrow.executeTrade`:
 * `keccak256(abi.encode(token, collateral, seller, buyer, tokenAmount, price))`
 */
export function computeTradeHash(
  token: Address,
  collateral: Address,
  seller: Address,
  buyer: Address,
  tokenAmount: bigint,
  price: bigint
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'address' },
        { type: 'address' },
        { type: 'address' },
        { type: 'uint256' },
        { type: 'uint256' },
      ],
      [token, collateral, seller, buyer, tokenAmount, price]
    )
  );
}

// ============================================================================
// Typed Data Builders (for signing)
// ============================================================================

/**
 * Build EIP-712 typed data for trade approval
 * This is what each party (seller/buyer) signs
 */
export function buildTradeApprovalTypedData(params: {
  tradeHash: Hex;
  signer: Address;
  nonce: bigint;
  deadline: bigint;
  verifyingContract: Address;
  chainId: number;
}) {
  return {
    domain: getSecondaryDomain(params.verifyingContract, params.chainId),
    types: TRADE_APPROVAL_TYPES,
    primaryType: 'TradeApproval' as const,
    message: {
      tradeHash: params.tradeHash,
      signer: params.signer,
      nonce: params.nonce,
      deadline: params.deadline,
    },
  };
}

/**
 * Build typed data for seller's trade approval signature
 */
export function buildSellerTradeApproval(params: {
  token: Address;
  collateral: Address;
  seller: Address;
  buyer: Address;
  tokenAmount: bigint;
  price: bigint;
  sellerNonce: bigint;
  sellerDeadline: bigint;
  verifyingContract: Address;
  chainId: number;
}) {
  const tradeHash = computeTradeHash(
    params.token,
    params.collateral,
    params.seller,
    params.buyer,
    params.tokenAmount,
    params.price
  );

  return buildTradeApprovalTypedData({
    tradeHash,
    signer: params.seller,
    nonce: params.sellerNonce,
    deadline: params.sellerDeadline,
    verifyingContract: params.verifyingContract,
    chainId: params.chainId,
  });
}

/**
 * Build typed data for buyer's trade approval signature
 */
export function buildBuyerTradeApproval(params: {
  token: Address;
  collateral: Address;
  seller: Address;
  buyer: Address;
  tokenAmount: bigint;
  price: bigint;
  buyerNonce: bigint;
  buyerDeadline: bigint;
  verifyingContract: Address;
  chainId: number;
}) {
  const tradeHash = computeTradeHash(
    params.token,
    params.collateral,
    params.seller,
    params.buyer,
    params.tokenAmount,
    params.price
  );

  return buildTradeApprovalTypedData({
    tradeHash,
    signer: params.buyer,
    nonce: params.buyerNonce,
    deadline: params.buyerDeadline,
    verifyingContract: params.verifyingContract,
    chainId: params.chainId,
  });
}

// ============================================================================
// Hash Computation for Verification
// ============================================================================

/**
 * Compute the EIP-712 hash for trade approval
 * This is the hash that will be signed
 */
export function hashTradeApproval(params: {
  tradeHash: Hex;
  signer: Address;
  nonce: bigint;
  deadline: bigint;
  verifyingContract: Address;
  chainId: number;
}): Hex {
  const typedData = buildTradeApprovalTypedData(params);
  return hashTypedData(typedData);
}
