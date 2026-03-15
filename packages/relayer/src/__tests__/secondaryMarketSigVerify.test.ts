import { describe, it, expect, vi } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { zeroAddress, type Address, type Hex } from 'viem';

// ---------------------------------------------------------------------------
// Mock the SDK contract addresses so chainId 13374202 resolves
// ---------------------------------------------------------------------------

const TEST_VERIFYING_CONTRACT =
  '0x16222940184Aad2E806529C963531e36c13875cF' as Address;

vi.mock('@sapience/sdk/contracts/addresses', () => ({
  secondaryMarketEscrow: {
    13374202: {
      address: '0x16222940184Aad2E806529C963531e36c13875cF',
      legacy: [],
    },
  } as Record<number, { address: string; legacy: string[] }>,
}));

import {
  verifySellerSignature,
  verifyBuyerSignature,
} from '../secondaryMarketSigVerify';
import {
  computeTradeHash,
  buildTradeApprovalTypedData,
} from '@sapience/sdk/auction/secondarySigning';
import type {
  SecondaryAuctionRequestPayload,
  SecondaryBidPayload,
} from '@sapience/sdk/types/secondary';

// ---------------------------------------------------------------------------
// Test account setup
// ---------------------------------------------------------------------------

// Standard Hardhat/Anvil test private key #0
const TEST_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;

const account = privateKeyToAccount(TEST_PRIVATE_KEY);
const TEST_CHAIN_ID = 13374202;

const futureDeadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
const pastDeadline = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

// ---------------------------------------------------------------------------
// Signing helpers
// ---------------------------------------------------------------------------

async function signSellerApproval(params: {
  token: Address;
  collateral: Address;
  seller: Address;
  tokenAmount: bigint;
  price: bigint;
  sellerNonce: bigint;
  sellerDeadline: bigint;
}): Promise<Hex> {
  // Seller signs with buyer = address(0) since buyer is unknown at listing time
  const tradeHash = computeTradeHash(
    params.token,
    params.collateral,
    params.seller,
    zeroAddress,
    params.tokenAmount,
    params.price
  );

  const typedData = buildTradeApprovalTypedData({
    tradeHash,
    signer: params.seller,
    nonce: params.sellerNonce,
    deadline: params.sellerDeadline,
    verifyingContract: TEST_VERIFYING_CONTRACT,
    chainId: TEST_CHAIN_ID,
  });

  // buildTradeApprovalTypedData returns chainId as BigInt in the domain;
  // the account.signTypedData handles this correctly
  return account.signTypedData(typedData);
}

async function signBuyerApproval(params: {
  token: Address;
  collateral: Address;
  seller: Address;
  buyer: Address;
  tokenAmount: bigint;
  price: bigint;
  buyerNonce: bigint;
  buyerDeadline: bigint;
}): Promise<Hex> {
  const tradeHash = computeTradeHash(
    params.token,
    params.collateral,
    params.seller,
    params.buyer,
    params.tokenAmount,
    params.price
  );

  const typedData = buildTradeApprovalTypedData({
    tradeHash,
    signer: params.buyer,
    nonce: params.buyerNonce,
    deadline: params.buyerDeadline,
    verifyingContract: TEST_VERIFYING_CONTRACT,
    chainId: TEST_CHAIN_ID,
  });

  return account.signTypedData(typedData);
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

async function createSignedSellerPayload(
  overrides: Partial<SecondaryAuctionRequestPayload> = {}
): Promise<SecondaryAuctionRequestPayload> {
  const base = {
    token: '0x1111111111111111111111111111111111111111' as Address,
    collateral: '0x2222222222222222222222222222222222222222' as Address,
    tokenAmount: '1000000000000000000',
    minPrice: '500000000000000000',
    seller: account.address,
    sellerNonce: 1,
    sellerDeadline: futureDeadline,
    chainId: TEST_CHAIN_ID,
    ...overrides,
  };

  // Generate real signature unless one was provided in overrides
  const sellerSignature =
    overrides.sellerSignature ??
    (await signSellerApproval({
      token: base.token,
      collateral: base.collateral,
      seller: base.seller as Address,
      tokenAmount: BigInt(base.tokenAmount),
      price: BigInt(base.minPrice),
      sellerNonce: BigInt(base.sellerNonce),
      sellerDeadline: BigInt(base.sellerDeadline),
    }));

  return { ...base, sellerSignature };
}

async function createSignedBidPayload(
  listing: SecondaryAuctionRequestPayload,
  overrides: Partial<SecondaryBidPayload> = {}
): Promise<SecondaryBidPayload> {
  const base = {
    auctionId: 'test-auction-id',
    buyer: account.address,
    price: '600000000000000000',
    buyerNonce: 1,
    buyerDeadline: futureDeadline,
    ...overrides,
  };

  const buyerSignature =
    overrides.buyerSignature ??
    (await signBuyerApproval({
      token: listing.token as Address,
      collateral: listing.collateral as Address,
      seller: listing.seller as Address,
      buyer: base.buyer as Address,
      tokenAmount: BigInt(listing.tokenAmount),
      price: BigInt(base.price),
      buyerNonce: BigInt(base.buyerNonce),
      buyerDeadline: BigInt(base.buyerDeadline),
    }));

  return { ...base, buyerSignature };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('secondaryMarketSigVerify', () => {
  // ========================================================================
  // verifySellerSignature
  // ========================================================================

  describe('verifySellerSignature', () => {
    it('valid signature returns true', async () => {
      const payload = await createSignedSellerPayload();
      const result = await verifySellerSignature(payload);
      expect(result).toBe(true);
    });

    it('wrong seller address (sig mismatch) returns false', async () => {
      // Sign as the test account, but claim to be a different seller
      const payload = await createSignedSellerPayload({
        seller: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      });
      const result = await verifySellerSignature(payload);
      expect(result).toBe(false);
    });

    it('expired deadline returns false', async () => {
      const payload = await createSignedSellerPayload({
        sellerDeadline: pastDeadline,
      });
      const result = await verifySellerSignature(payload);
      expect(result).toBe(false);
    });

    it('empty signature returns false', async () => {
      const payload = await createSignedSellerPayload({
        sellerSignature: '',
      });
      const result = await verifySellerSignature(payload);
      expect(result).toBe(false);
    });

    it('missing signature returns false', async () => {
      const payload = await createSignedSellerPayload();
      (payload as any).sellerSignature = undefined;
      const result = await verifySellerSignature(payload);
      expect(result).toBe(false);
    });

    it('unknown chainId (no contract) returns false', async () => {
      const payload = await createSignedSellerPayload({
        chainId: 999999,
      });
      const result = await verifySellerSignature(payload);
      expect(result).toBe(false);
    });
  });

  // ========================================================================
  // verifyBuyerSignature
  // ========================================================================

  describe('verifyBuyerSignature', () => {
    it('valid signature returns true', async () => {
      const listing = await createSignedSellerPayload();
      const bid = await createSignedBidPayload(listing);
      const result = await verifyBuyerSignature(bid, listing);
      expect(result).toBe(true);
    });

    it('wrong buyer address (sig mismatch) returns false', async () => {
      const listing = await createSignedSellerPayload();
      const bid = await createSignedBidPayload(listing, {
        buyer: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      });
      const result = await verifyBuyerSignature(bid, listing);
      expect(result).toBe(false);
    });

    it('expired deadline returns false', async () => {
      const listing = await createSignedSellerPayload();
      const bid = await createSignedBidPayload(listing, {
        buyerDeadline: pastDeadline,
      });
      const result = await verifyBuyerSignature(bid, listing);
      expect(result).toBe(false);
    });

    it('empty buyer signature returns false', async () => {
      const listing = await createSignedSellerPayload();
      const bid = await createSignedBidPayload(listing, {
        buyerSignature: '',
      });
      const result = await verifyBuyerSignature(bid, listing);
      expect(result).toBe(false);
    });

    it('missing buyer signature returns false', async () => {
      const listing = await createSignedSellerPayload();
      const bid = await createSignedBidPayload(listing);
      (bid as any).buyerSignature = undefined;
      const result = await verifyBuyerSignature(bid, listing);
      expect(result).toBe(false);
    });

    it('unknown chainId on listing returns false', async () => {
      const listing = await createSignedSellerPayload({ chainId: 999999 });
      const bid = await createSignedBidPayload(listing);
      const result = await verifyBuyerSignature(bid, listing);
      expect(result).toBe(false);
    });
  });
});
