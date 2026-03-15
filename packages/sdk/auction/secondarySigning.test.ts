/**
 * Golden Hash Tests for secondarySigning.ts
 *
 * These tests ensure the TypeScript hash computations match the Solidity contract.
 * They catch:
 *   - Missing fields in hash computation
 *   - Wrong encoding order or types
 *   - Accidental field removal during refactors
 *   - Domain drift (wrong chainId or verifyingContract)
 *   - Signer assignment bugs (seller vs buyer)
 *
 * The "golden values" are computed inline using viem's hashTypedData —
 * the same EIP-712 spec implementation that OpenZeppelin uses.
 * If the SDK functions drift from the spec, these tests break.
 */

import { describe, test, expect } from 'vitest';
import {
  encodeAbiParameters,
  getAddress,
  hashTypedData,
  keccak256,
  zeroAddress,
} from 'viem';

import {
  computeTradeHash,
  buildTradeApprovalTypedData,
  buildSellerTradeApproval,
  buildBuyerTradeApproval,
  hashTradeApproval,
  getSecondaryDomain,
  TRADE_APPROVAL_TYPES,
} from './secondarySigning';

// ============================================================================
// Test Fixtures
// ============================================================================

const SELLER = getAddress('0x1111111111111111111111111111111111111111');
const BUYER = getAddress('0x2222222222222222222222222222222222222222');
const TOKEN = getAddress('0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa');
const COLLATERAL = getAddress('0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB');
const ESCROW_CONTRACT = getAddress(
  '0x3333333333333333333333333333333333333333'
);
const CHAIN_ID = 13374202; // Ethereal testnet

const TOKEN_AMOUNT = 1000000n;
const PRICE = 500000n;
const NONCE = 42n;
const DEADLINE = 1700000000n;

// ============================================================================
// 1. computeTradeHash — field completeness
// ============================================================================

describe('computeTradeHash', () => {
  test('matches manual abi.encode computation', () => {
    // Compute the expected hash manually using the same encoding the contract uses:
    // keccak256(abi.encode(token, collateral, seller, buyer, tokenAmount, price))
    const expected = keccak256(
      encodeAbiParameters(
        [
          { type: 'address' },
          { type: 'address' },
          { type: 'address' },
          { type: 'address' },
          { type: 'uint256' },
          { type: 'uint256' },
        ],
        [TOKEN, COLLATERAL, SELLER, BUYER, TOKEN_AMOUNT, PRICE]
      )
    );

    const actual = computeTradeHash(
      TOKEN,
      COLLATERAL,
      SELLER,
      BUYER,
      TOKEN_AMOUNT,
      PRICE
    );

    expect(actual).toBe(expected);
  });

  test('changing any field changes the hash', () => {
    const base = computeTradeHash(
      TOKEN,
      COLLATERAL,
      SELLER,
      BUYER,
      TOKEN_AMOUNT,
      PRICE
    );

    // Different token
    expect(
      computeTradeHash(
        COLLATERAL,
        COLLATERAL,
        SELLER,
        BUYER,
        TOKEN_AMOUNT,
        PRICE
      )
    ).not.toBe(base);

    // Different collateral
    expect(
      computeTradeHash(TOKEN, TOKEN, SELLER, BUYER, TOKEN_AMOUNT, PRICE)
    ).not.toBe(base);

    // Different seller
    expect(
      computeTradeHash(TOKEN, COLLATERAL, BUYER, BUYER, TOKEN_AMOUNT, PRICE)
    ).not.toBe(base);

    // Different buyer
    expect(
      computeTradeHash(TOKEN, COLLATERAL, SELLER, SELLER, TOKEN_AMOUNT, PRICE)
    ).not.toBe(base);

    // Different tokenAmount
    expect(
      computeTradeHash(TOKEN, COLLATERAL, SELLER, BUYER, 2000000n, PRICE)
    ).not.toBe(base);

    // Different price
    expect(
      computeTradeHash(TOKEN, COLLATERAL, SELLER, BUYER, TOKEN_AMOUNT, 999999n)
    ).not.toBe(base);
  });
});

// ============================================================================
// 2. TRADE_APPROVAL_TYPES — field names and types match Solidity typehash
// ============================================================================

describe('TRADE_APPROVAL_TYPES', () => {
  test('field names match TradeApproval typehash structure', () => {
    // These must match SecondaryMarketEscrow.TRADE_APPROVAL_TYPEHASH:
    // keccak256("TradeApproval(bytes32 tradeHash,address signer,uint256 nonce,uint256 deadline)")
    const fieldNames = TRADE_APPROVAL_TYPES.TradeApproval.map((f) => f.name);
    expect(fieldNames).toEqual(['tradeHash', 'signer', 'nonce', 'deadline']);
  });

  test('field types match TradeApproval typehash structure', () => {
    const fieldTypes = TRADE_APPROVAL_TYPES.TradeApproval.map((f) => f.type);
    expect(fieldTypes).toEqual(['bytes32', 'address', 'uint256', 'uint256']);
  });

  test('reconstructed typehash string matches expected format', () => {
    // Reconstruct the typehash string from the type definitions
    const fields = TRADE_APPROVAL_TYPES.TradeApproval.map(
      (f) => `${f.type} ${f.name}`
    ).join(',');
    const typeString = `TradeApproval(${fields})`;

    expect(typeString).toBe(
      'TradeApproval(bytes32 tradeHash,address signer,uint256 nonce,uint256 deadline)'
    );
  });
});

// ============================================================================
// 3. getSecondaryDomain — name, version, verifyingContract, chainId
// ============================================================================

describe('getSecondaryDomain', () => {
  test('name is SecondaryMarketEscrow', () => {
    const domain = getSecondaryDomain(ESCROW_CONTRACT, CHAIN_ID);
    expect(domain.name).toBe('SecondaryMarketEscrow');
  });

  test('version is 1', () => {
    const domain = getSecondaryDomain(ESCROW_CONTRACT, CHAIN_ID);
    expect(domain.version).toBe('1');
  });

  test('verifyingContract matches input', () => {
    const domain = getSecondaryDomain(ESCROW_CONTRACT, CHAIN_ID);
    expect(domain.verifyingContract).toBe(ESCROW_CONTRACT);
  });

  test('chainId matches input as bigint', () => {
    const domain = getSecondaryDomain(ESCROW_CONTRACT, CHAIN_ID);
    expect(domain.chainId).toBe(BigInt(CHAIN_ID));
  });
});

// ============================================================================
// 4. buildTradeApprovalTypedData — domain, types, primaryType, message
// ============================================================================

describe('buildTradeApprovalTypedData', () => {
  const tradeHash = computeTradeHash(
    TOKEN,
    COLLATERAL,
    SELLER,
    BUYER,
    TOKEN_AMOUNT,
    PRICE
  );

  test('domain matches contract config', () => {
    const typed = buildTradeApprovalTypedData({
      tradeHash,
      signer: SELLER,
      nonce: NONCE,
      deadline: DEADLINE,
      verifyingContract: ESCROW_CONTRACT,
      chainId: CHAIN_ID,
    });

    expect(typed.domain.name).toBe('SecondaryMarketEscrow');
    expect(typed.domain.version).toBe('1');
    expect(typed.domain.verifyingContract).toBe(ESCROW_CONTRACT);
    expect(typed.domain.chainId).toBe(BigInt(CHAIN_ID));
  });

  test('types reference TRADE_APPROVAL_TYPES', () => {
    const typed = buildTradeApprovalTypedData({
      tradeHash,
      signer: SELLER,
      nonce: NONCE,
      deadline: DEADLINE,
      verifyingContract: ESCROW_CONTRACT,
      chainId: CHAIN_ID,
    });

    expect(typed.types).toBe(TRADE_APPROVAL_TYPES);
  });

  test('primaryType is TradeApproval', () => {
    const typed = buildTradeApprovalTypedData({
      tradeHash,
      signer: SELLER,
      nonce: NONCE,
      deadline: DEADLINE,
      verifyingContract: ESCROW_CONTRACT,
      chainId: CHAIN_ID,
    });

    expect(typed.primaryType).toBe('TradeApproval');
  });

  test('message contains all required fields', () => {
    const typed = buildTradeApprovalTypedData({
      tradeHash,
      signer: SELLER,
      nonce: NONCE,
      deadline: DEADLINE,
      verifyingContract: ESCROW_CONTRACT,
      chainId: CHAIN_ID,
    });

    expect(typed.message.tradeHash).toBe(tradeHash);
    expect(typed.message.signer).toBe(SELLER);
    expect(typed.message.nonce).toBe(NONCE);
    expect(typed.message.deadline).toBe(DEADLINE);
  });
});

// ============================================================================
// 5. buildSellerTradeApproval — signer is seller, correct tradeHash
// ============================================================================

describe('buildSellerTradeApproval', () => {
  test('signer is seller', () => {
    const typed = buildSellerTradeApproval({
      token: TOKEN,
      collateral: COLLATERAL,
      seller: SELLER,
      buyer: BUYER,
      tokenAmount: TOKEN_AMOUNT,
      price: PRICE,
      sellerNonce: NONCE,
      sellerDeadline: DEADLINE,
      verifyingContract: ESCROW_CONTRACT,
      chainId: CHAIN_ID,
    });

    expect(typed.message.signer).toBe(SELLER);
  });

  test('computes correct tradeHash', () => {
    const typed = buildSellerTradeApproval({
      token: TOKEN,
      collateral: COLLATERAL,
      seller: SELLER,
      buyer: BUYER,
      tokenAmount: TOKEN_AMOUNT,
      price: PRICE,
      sellerNonce: NONCE,
      sellerDeadline: DEADLINE,
      verifyingContract: ESCROW_CONTRACT,
      chainId: CHAIN_ID,
    });

    const expectedTradeHash = computeTradeHash(
      TOKEN,
      COLLATERAL,
      SELLER,
      BUYER,
      TOKEN_AMOUNT,
      PRICE
    );

    expect(typed.message.tradeHash).toBe(expectedTradeHash);
  });

  test('uses seller nonce and deadline', () => {
    const sellerNonce = 99n;
    const sellerDeadline = 1800000000n;

    const typed = buildSellerTradeApproval({
      token: TOKEN,
      collateral: COLLATERAL,
      seller: SELLER,
      buyer: BUYER,
      tokenAmount: TOKEN_AMOUNT,
      price: PRICE,
      sellerNonce,
      sellerDeadline,
      verifyingContract: ESCROW_CONTRACT,
      chainId: CHAIN_ID,
    });

    expect(typed.message.nonce).toBe(sellerNonce);
    expect(typed.message.deadline).toBe(sellerDeadline);
  });
});

// ============================================================================
// 6. buildBuyerTradeApproval — signer is buyer, correct tradeHash
// ============================================================================

describe('buildBuyerTradeApproval', () => {
  test('signer is buyer', () => {
    const typed = buildBuyerTradeApproval({
      token: TOKEN,
      collateral: COLLATERAL,
      seller: SELLER,
      buyer: BUYER,
      tokenAmount: TOKEN_AMOUNT,
      price: PRICE,
      buyerNonce: NONCE,
      buyerDeadline: DEADLINE,
      verifyingContract: ESCROW_CONTRACT,
      chainId: CHAIN_ID,
    });

    expect(typed.message.signer).toBe(BUYER);
  });

  test('computes correct tradeHash', () => {
    const typed = buildBuyerTradeApproval({
      token: TOKEN,
      collateral: COLLATERAL,
      seller: SELLER,
      buyer: BUYER,
      tokenAmount: TOKEN_AMOUNT,
      price: PRICE,
      buyerNonce: NONCE,
      buyerDeadline: DEADLINE,
      verifyingContract: ESCROW_CONTRACT,
      chainId: CHAIN_ID,
    });

    const expectedTradeHash = computeTradeHash(
      TOKEN,
      COLLATERAL,
      SELLER,
      BUYER,
      TOKEN_AMOUNT,
      PRICE
    );

    expect(typed.message.tradeHash).toBe(expectedTradeHash);
  });

  test('uses buyer nonce and deadline', () => {
    const buyerNonce = 77n;
    const buyerDeadline = 1900000000n;

    const typed = buildBuyerTradeApproval({
      token: TOKEN,
      collateral: COLLATERAL,
      seller: SELLER,
      buyer: BUYER,
      tokenAmount: TOKEN_AMOUNT,
      price: PRICE,
      buyerNonce,
      buyerDeadline,
      verifyingContract: ESCROW_CONTRACT,
      chainId: CHAIN_ID,
    });

    expect(typed.message.nonce).toBe(buyerNonce);
    expect(typed.message.deadline).toBe(buyerDeadline);
  });
});

// ============================================================================
// 7. Seller and buyer get same tradeHash
// ============================================================================

describe('signer assignment', () => {
  test('seller and buyer get the same tradeHash', () => {
    const sellerTyped = buildSellerTradeApproval({
      token: TOKEN,
      collateral: COLLATERAL,
      seller: SELLER,
      buyer: BUYER,
      tokenAmount: TOKEN_AMOUNT,
      price: PRICE,
      sellerNonce: NONCE,
      sellerDeadline: DEADLINE,
      verifyingContract: ESCROW_CONTRACT,
      chainId: CHAIN_ID,
    });

    const buyerTyped = buildBuyerTradeApproval({
      token: TOKEN,
      collateral: COLLATERAL,
      seller: SELLER,
      buyer: BUYER,
      tokenAmount: TOKEN_AMOUNT,
      price: PRICE,
      buyerNonce: NONCE,
      buyerDeadline: DEADLINE,
      verifyingContract: ESCROW_CONTRACT,
      chainId: CHAIN_ID,
    });

    // Both sides must agree on the tradeHash
    expect(sellerTyped.message.tradeHash).toBe(buyerTyped.message.tradeHash);

    // But they sign with different signers
    expect(sellerTyped.message.signer).not.toBe(buyerTyped.message.signer);
  });
});

// ============================================================================
// 8. hashTradeApproval — full EIP-712 hash stability
// ============================================================================

describe('hashTradeApproval', () => {
  const tradeHash = computeTradeHash(
    TOKEN,
    COLLATERAL,
    SELLER,
    BUYER,
    TOKEN_AMOUNT,
    PRICE
  );

  const params = {
    tradeHash,
    signer: SELLER,
    nonce: NONCE,
    deadline: DEADLINE,
    verifyingContract: ESCROW_CONTRACT,
    chainId: CHAIN_ID,
  };

  test('matches viem hashTypedData computation', () => {
    const fromFunction = hashTradeApproval(params);
    const fromViem = hashTypedData({
      domain: getSecondaryDomain(ESCROW_CONTRACT, CHAIN_ID),
      types: TRADE_APPROVAL_TYPES,
      primaryType: 'TradeApproval',
      message: {
        tradeHash,
        signer: SELLER,
        nonce: NONCE,
        deadline: DEADLINE,
      },
    });

    expect(fromFunction).toBe(fromViem);
  });
});

// ============================================================================
// 9. Domain drift — different chainId/verifyingContract produce different hash
// ============================================================================

describe('domain drift', () => {
  const tradeHash = computeTradeHash(
    TOKEN,
    COLLATERAL,
    SELLER,
    BUYER,
    TOKEN_AMOUNT,
    PRICE
  );

  const baseParams = {
    tradeHash,
    signer: SELLER,
    nonce: NONCE,
    deadline: DEADLINE,
    verifyingContract: ESCROW_CONTRACT,
    chainId: CHAIN_ID,
  };

  test('different chainId produces different hash', () => {
    const hash1 = hashTradeApproval(baseParams);
    const hash2 = hashTradeApproval({ ...baseParams, chainId: 42161 });
    expect(hash1).not.toBe(hash2);
  });

  test('different verifyingContract produces different hash', () => {
    const hash1 = hashTradeApproval(baseParams);
    const hash2 = hashTradeApproval({
      ...baseParams,
      verifyingContract: getAddress(
        '0x5555555555555555555555555555555555555555'
      ),
    });
    expect(hash1).not.toBe(hash2);
  });
});

// ============================================================================
// 10. Seller listing pattern — buyer=0x0 vs real buyer
// ============================================================================

describe('seller listing pattern (two-phase signing)', () => {
  test('seller signs with buyer=0x0 produces different hash than with real buyer', () => {
    // Phase 1: seller lists with buyer=zeroAddress (open listing)
    const listingTyped = buildSellerTradeApproval({
      token: TOKEN,
      collateral: COLLATERAL,
      seller: SELLER,
      buyer: zeroAddress,
      tokenAmount: TOKEN_AMOUNT,
      price: PRICE,
      sellerNonce: NONCE,
      sellerDeadline: DEADLINE,
      verifyingContract: ESCROW_CONTRACT,
      chainId: CHAIN_ID,
    });

    // Phase 2: seller signs with real buyer (matched trade)
    const matchedTyped = buildSellerTradeApproval({
      token: TOKEN,
      collateral: COLLATERAL,
      seller: SELLER,
      buyer: BUYER,
      tokenAmount: TOKEN_AMOUNT,
      price: PRICE,
      sellerNonce: NONCE,
      sellerDeadline: DEADLINE,
      verifyingContract: ESCROW_CONTRACT,
      chainId: CHAIN_ID,
    });

    // The tradeHashes MUST differ — this is critical for the two-phase flow.
    // A listing (buyer=0x0) cannot be replayed as a matched trade (buyer=real address).
    expect(listingTyped.message.tradeHash).not.toBe(
      matchedTyped.message.tradeHash
    );
  });

  test('listing tradeHash uses zeroAddress as buyer in the encoding', () => {
    const listingTyped = buildSellerTradeApproval({
      token: TOKEN,
      collateral: COLLATERAL,
      seller: SELLER,
      buyer: zeroAddress,
      tokenAmount: TOKEN_AMOUNT,
      price: PRICE,
      sellerNonce: NONCE,
      sellerDeadline: DEADLINE,
      verifyingContract: ESCROW_CONTRACT,
      chainId: CHAIN_ID,
    });

    // Manually compute the expected tradeHash with buyer=zeroAddress
    const expectedTradeHash = keccak256(
      encodeAbiParameters(
        [
          { type: 'address' },
          { type: 'address' },
          { type: 'address' },
          { type: 'address' },
          { type: 'uint256' },
          { type: 'uint256' },
        ],
        [TOKEN, COLLATERAL, SELLER, zeroAddress, TOKEN_AMOUNT, PRICE]
      )
    );

    expect(listingTyped.message.tradeHash).toBe(expectedTradeHash);
  });
});
