/**
 * Tests for secondary market validation.
 *
 * Uses real EIP-712 signature generation (via viem's signTypedData with
 * test accounts) to exercise the full verification pipeline.
 *
 * Follows the same tier 1 / tier 2 pattern as the escrow validation tests.
 */

import { describe, test, expect } from 'vitest';
import type { Address, Hex } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { zeroAddress } from 'viem';
import {
  validateSecondaryListing,
  validateSecondaryBid,
  type ValidateSecondaryListingOptions,
  type ValidateSecondaryBidOptions,
} from '../secondaryValidation';
import {
  buildSellerTradeApproval,
  buildBuyerTradeApproval,
} from '../secondarySigning';
import type {
  SecondaryAuctionRequestPayload,
  SecondaryBidPayload,
} from '../../types/secondary';

// ─── Test fixtures ────────────────────────────────────────────────────────────

const VERIFYING_CONTRACT =
  '0x16222940184Aad2E806529C963531e36c13875cF' as Address;
const CHAIN_ID = 13374202;

const TOKEN = '0x1111111111111111111111111111111111111111' as Address;
const COLLATERAL = '0x2222222222222222222222222222222222222222' as Address;

const sellerAccount = privateKeyToAccount(generatePrivateKey());
const buyerAccount = privateKeyToAccount(generatePrivateKey());

function futureDeadline(offsetSec = 3600): number {
  return Math.floor(Date.now() / 1000) + offsetSec;
}

const DEFAULT_LISTING_OPTS: ValidateSecondaryListingOptions = {
  verifyingContract: VERIFYING_CONTRACT,
  chainId: CHAIN_ID,
};

const DEFAULT_BID_OPTS: ValidateSecondaryBidOptions = {
  verifyingContract: VERIFYING_CONTRACT,
  chainId: CHAIN_ID,
};

// ─── Helpers to build valid payloads with real signatures ─────────────────────

async function makeSignedListing(
  overrides: Partial<SecondaryAuctionRequestPayload> = {}
): Promise<SecondaryAuctionRequestPayload> {
  const nonce = Math.floor(Math.random() * 1_000_000);
  const deadline = futureDeadline();
  const tokenAmount = '1000000000000000000';

  const typedData = buildSellerTradeApproval({
    token: TOKEN,
    collateral: COLLATERAL,
    seller: sellerAccount.address,
    buyer: zeroAddress, // buyer unknown at listing time
    tokenAmount: BigInt(tokenAmount),
    price: 0n, // price unknown at listing time
    sellerNonce: BigInt(nonce),
    sellerDeadline: BigInt(deadline),
    verifyingContract: VERIFYING_CONTRACT,
    chainId: CHAIN_ID,
  });

  const sellerSignature = await sellerAccount.signTypedData({
    domain: { ...typedData.domain, chainId: Number(typedData.domain.chainId) },
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  });

  return {
    token: TOKEN,
    collateral: COLLATERAL,
    tokenAmount,
    seller: sellerAccount.address,
    sellerNonce: nonce,
    sellerDeadline: deadline,
    sellerSignature,
    chainId: CHAIN_ID,
    ...overrides,
  };
}

async function makeSignedBid(
  listing: SecondaryAuctionRequestPayload,
  overrides: Partial<SecondaryBidPayload> = {}
): Promise<SecondaryBidPayload> {
  const nonce = Math.floor(Math.random() * 1_000_000);
  const deadline = futureDeadline();
  const price = '600000000000000000';

  const typedData = buildBuyerTradeApproval({
    token: listing.token as Address,
    collateral: listing.collateral as Address,
    seller: listing.seller as Address,
    buyer: buyerAccount.address,
    tokenAmount: BigInt(listing.tokenAmount),
    price: BigInt(price),
    buyerNonce: BigInt(nonce),
    buyerDeadline: BigInt(deadline),
    verifyingContract: VERIFYING_CONTRACT,
    chainId: CHAIN_ID,
  });

  const buyerSignature = await buyerAccount.signTypedData({
    domain: { ...typedData.domain, chainId: Number(typedData.domain.chainId) },
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  });

  return {
    auctionId: 'test-auction-id',
    buyer: buyerAccount.address,
    price,
    buyerNonce: nonce,
    buyerDeadline: deadline,
    buyerSignature,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// validateSecondaryListing (Tier 1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('validateSecondaryListing', () => {
  // ── Happy path ──────────────────────────────────────────────────────────────

  test('returns valid for correctly signed listing', async () => {
    const listing = await makeSignedListing();
    const result = await validateSecondaryListing(
      listing,
      DEFAULT_LISTING_OPTS
    );
    expect(result.status).toBe('valid');
    if (result.status === 'valid') {
      expect(result.recoveredSigner?.toLowerCase()).toBe(
        sellerAccount.address.toLowerCase()
      );
    }
  });

  // ── Field presence ──────────────────────────────────────────────────────────

  test('rejects missing token address', async () => {
    const listing = await makeSignedListing({ token: '' });
    const result = await validateSecondaryListing(
      listing,
      DEFAULT_LISTING_OPTS
    );
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('MISSING_FIELD');
    }
  });

  test('rejects invalid token address format', async () => {
    const listing = await makeSignedListing({ token: '0xNOTANADDRESS' });
    const result = await validateSecondaryListing(
      listing,
      DEFAULT_LISTING_OPTS
    );
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('MISSING_FIELD');
    }
  });

  test('rejects missing collateral address', async () => {
    const listing = await makeSignedListing({ collateral: '' });
    const result = await validateSecondaryListing(
      listing,
      DEFAULT_LISTING_OPTS
    );
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('MISSING_FIELD');
    }
  });

  test('rejects missing seller address', async () => {
    const listing = await makeSignedListing({ seller: '' });
    const result = await validateSecondaryListing(
      listing,
      DEFAULT_LISTING_OPTS
    );
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('MISSING_FIELD');
    }
  });

  test('rejects zero tokenAmount', async () => {
    const listing = await makeSignedListing({ tokenAmount: '0' });
    const result = await validateSecondaryListing(
      listing,
      DEFAULT_LISTING_OPTS
    );
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('MISSING_FIELD');
    }
  });

  test('rejects invalid tokenAmount format', async () => {
    const listing = await makeSignedListing({ tokenAmount: 'not-a-number' });
    const result = await validateSecondaryListing(
      listing,
      DEFAULT_LISTING_OPTS
    );
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('MISSING_FIELD');
    }
  });

  test('rejects invalid nonce', async () => {
    const listing = await makeSignedListing({
      sellerNonce: -1,
    });
    const result = await validateSecondaryListing(
      listing,
      DEFAULT_LISTING_OPTS
    );
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('MISSING_FIELD');
    }
  });

  test('rejects non-finite nonce', async () => {
    const listing = await makeSignedListing({
      sellerNonce: NaN,
    });
    const result = await validateSecondaryListing(
      listing,
      DEFAULT_LISTING_OPTS
    );
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('MISSING_FIELD');
    }
  });

  // ── Chain ID ────────────────────────────────────────────────────────────────

  test('rejects invalid chainId', async () => {
    const listing = await makeSignedListing({ chainId: 0 });
    const result = await validateSecondaryListing(
      listing,
      DEFAULT_LISTING_OPTS
    );
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('MISSING_FIELD');
    }
  });

  test('rejects chain mismatch', async () => {
    const listing = await makeSignedListing({ chainId: 999999 });
    const result = await validateSecondaryListing(listing, {
      ...DEFAULT_LISTING_OPTS,
      chainId: CHAIN_ID,
    });
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('CHAIN_MISMATCH');
    }
  });

  // ── Deadline ────────────────────────────────────────────────────────────────

  test('rejects expired deadline', async () => {
    const pastDeadline = Math.floor(Date.now() / 1000) - 100;
    const listing = await makeSignedListing({ sellerDeadline: pastDeadline });
    const result = await validateSecondaryListing(
      listing,
      DEFAULT_LISTING_OPTS
    );
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('EXPIRED_DEADLINE');
    }
  });

  test('rejects deadline too far in future when maxDeadlineSeconds set', async () => {
    const farDeadline = Math.floor(Date.now() / 1000) + 100_000;
    const listing = await makeSignedListing({ sellerDeadline: farDeadline });
    const result = await validateSecondaryListing(listing, {
      ...DEFAULT_LISTING_OPTS,
      maxDeadlineSeconds: 7200,
    });
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('DEADLINE_TOO_FAR');
    }
  });

  // ── Signature ───────────────────────────────────────────────────────────────

  test('rejects missing signature', async () => {
    const listing = await makeSignedListing({ sellerSignature: '' });
    const result = await validateSecondaryListing(
      listing,
      DEFAULT_LISTING_OPTS
    );
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('INVALID_SIGNATURE');
    }
  });

  test('rejects malformed signature (too short)', async () => {
    const listing = await makeSignedListing({ sellerSignature: '0x1234' });
    const result = await validateSecondaryListing(
      listing,
      DEFAULT_LISTING_OPTS
    );
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('INVALID_SIGNATURE');
    }
  });

  test('rejects signature from wrong signer', async () => {
    // Sign with buyer's key but claim to be seller
    const wrongSigner = privateKeyToAccount(generatePrivateKey());
    const listing = await makeSignedListing();

    const typedData = buildSellerTradeApproval({
      token: TOKEN,
      collateral: COLLATERAL,
      seller: sellerAccount.address,
      buyer: zeroAddress,
      tokenAmount: BigInt(listing.tokenAmount),
      price: 0n,
      sellerNonce: BigInt(listing.sellerNonce),
      sellerDeadline: BigInt(listing.sellerDeadline),
      verifyingContract: VERIFYING_CONTRACT,
      chainId: CHAIN_ID,
    });

    const wrongSignature = await wrongSigner.signTypedData({
      domain: {
        ...typedData.domain,
        chainId: Number(typedData.domain.chainId),
      },
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: typedData.message,
    });

    listing.sellerSignature = wrongSignature;

    const result = await validateSecondaryListing(
      listing,
      DEFAULT_LISTING_OPTS
    );
    // Without ERC-1271 / smart account support, wrong signer returns unverified
    // (matching escrow pattern: offline mismatch = unverified, not invalid)
    expect(result.status).toBe('unverified');
  });

  // ── Session key passthrough ─────────────────────────────────────────────────

  test('returns unverified for session key listings (not blindly valid)', async () => {
    const listing = await makeSignedListing({
      sellerSessionKeyData: '0x' + 'aa'.repeat(100),
    });
    const result = await validateSecondaryListing(
      listing,
      DEFAULT_LISTING_OPTS
    );
    expect(result.status).toBe('unverified');
    if (result.status === 'unverified') {
      expect(result.code).toBe('SIGNATURE_UNVERIFIABLE');
      expect(result.reason).toContain('session key');
    }
  });

  test('rejects session key data that is not valid hex', async () => {
    const listing = await makeSignedListing({
      sellerSessionKeyData: 'not-hex-data',
    });
    const result = await validateSecondaryListing(
      listing,
      DEFAULT_LISTING_OPTS
    );
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('INVALID_SIGNATURE');
    }
  });

  // ── Signature length validation ──────────────────────────────────────────────

  test('rejects signature shorter than compact ECDSA minimum (130 chars)', async () => {
    // 20 hex chars (10 bytes) — passes old >=10 check but far too short for ECDSA
    const listing = await makeSignedListing({
      sellerSignature: '0x' + 'aa'.repeat(20),
    });
    const result = await validateSecondaryListing(
      listing,
      DEFAULT_LISTING_OPTS
    );
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('INVALID_SIGNATURE');
    }
  });

  // ── Empty hex session key bypass ──────────────────────────────────────────────

  test('rejects empty hex session key data (0x only) — prevents sig bypass', async () => {
    const listing = await makeSignedListing({
      sellerSessionKeyData: '0x',
    });
    const result = await validateSecondaryListing(
      listing,
      DEFAULT_LISTING_OPTS
    );
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('INVALID_SIGNATURE');
    }
  });

  // ── Skipping signature verification ─────────────────────────────────────────

  test('skips signature verification when verifySignature=false', async () => {
    const listing = await makeSignedListing({
      sellerSignature: '0x' + 'ff'.repeat(65),
    });
    const result = await validateSecondaryListing(listing, {
      ...DEFAULT_LISTING_OPTS,
      verifySignature: false,
    });
    expect(result.status).toBe('valid');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// validateSecondaryBid (Tier 1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('validateSecondaryBid', () => {
  // ── Happy path ──────────────────────────────────────────────────────────────

  test('returns valid for correctly signed bid', async () => {
    const listing = await makeSignedListing();
    const bid = await makeSignedBid(listing);
    const result = await validateSecondaryBid(bid, listing, DEFAULT_BID_OPTS);
    expect(result.status).toBe('valid');
    if (result.status === 'valid') {
      expect(result.recoveredSigner?.toLowerCase()).toBe(
        buyerAccount.address.toLowerCase()
      );
    }
  });

  // ── Field presence ──────────────────────────────────────────────────────────

  test('rejects missing auctionId', async () => {
    const listing = await makeSignedListing();
    const bid = await makeSignedBid(listing, { auctionId: '' });
    const result = await validateSecondaryBid(bid, listing, DEFAULT_BID_OPTS);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('MISSING_FIELD');
    }
  });

  test('rejects missing buyer address', async () => {
    const listing = await makeSignedListing();
    const bid = await makeSignedBid(listing, { buyer: '' });
    const result = await validateSecondaryBid(bid, listing, DEFAULT_BID_OPTS);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('MISSING_FIELD');
    }
  });

  test('rejects invalid buyer address', async () => {
    const listing = await makeSignedListing();
    const bid = await makeSignedBid(listing, { buyer: '0xINVALID' });
    const result = await validateSecondaryBid(bid, listing, DEFAULT_BID_OPTS);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('MISSING_FIELD');
    }
  });

  test('rejects zero price', async () => {
    const listing = await makeSignedListing();
    const bid = await makeSignedBid(listing, { price: '0' });
    const result = await validateSecondaryBid(bid, listing, DEFAULT_BID_OPTS);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('MISSING_FIELD');
    }
  });

  test('rejects invalid price format', async () => {
    const listing = await makeSignedListing();
    const bid = await makeSignedBid(listing, { price: 'garbage' });
    const result = await validateSecondaryBid(bid, listing, DEFAULT_BID_OPTS);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('MISSING_FIELD');
    }
  });

  test('rejects invalid nonce', async () => {
    const listing = await makeSignedListing();
    const bid = await makeSignedBid(listing, { buyerNonce: -5 });
    const result = await validateSecondaryBid(bid, listing, DEFAULT_BID_OPTS);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('MISSING_FIELD');
    }
  });

  // ── Deadline ────────────────────────────────────────────────────────────────

  test('rejects expired buyer deadline', async () => {
    const listing = await makeSignedListing();
    const pastDeadline = Math.floor(Date.now() / 1000) - 100;
    const bid = await makeSignedBid(listing, { buyerDeadline: pastDeadline });
    const result = await validateSecondaryBid(bid, listing, DEFAULT_BID_OPTS);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('EXPIRED_DEADLINE');
    }
  });

  // ── Price validation ────────────────────────────────────────────────────────

  // ── Signature ───────────────────────────────────────────────────────────────

  test('rejects missing buyer signature', async () => {
    const listing = await makeSignedListing();
    const bid = await makeSignedBid(listing, { buyerSignature: '' });
    const result = await validateSecondaryBid(bid, listing, DEFAULT_BID_OPTS);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('INVALID_SIGNATURE');
    }
  });

  test('rejects malformed buyer signature', async () => {
    const listing = await makeSignedListing();
    const bid = await makeSignedBid(listing, { buyerSignature: '0xdead' });
    const result = await validateSecondaryBid(bid, listing, DEFAULT_BID_OPTS);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('INVALID_SIGNATURE');
    }
  });

  test('returns unverified for signature from wrong signer', async () => {
    const listing = await makeSignedListing();
    const bid = await makeSignedBid(listing);

    // Replace signature with one from a different account
    const wrongSigner = privateKeyToAccount(generatePrivateKey());
    const typedData = buildBuyerTradeApproval({
      token: listing.token as Address,
      collateral: listing.collateral as Address,
      seller: listing.seller as Address,
      buyer: buyerAccount.address,
      tokenAmount: BigInt(listing.tokenAmount),
      price: BigInt(bid.price),
      buyerNonce: BigInt(bid.buyerNonce),
      buyerDeadline: BigInt(bid.buyerDeadline),
      verifyingContract: VERIFYING_CONTRACT,
      chainId: CHAIN_ID,
    });

    bid.buyerSignature = await wrongSigner.signTypedData({
      domain: {
        ...typedData.domain,
        chainId: Number(typedData.domain.chainId),
      },
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: typedData.message,
    });

    const result = await validateSecondaryBid(bid, listing, DEFAULT_BID_OPTS);
    expect(result.status).toBe('unverified');
  });

  // ── Session key passthrough ─────────────────────────────────────────────────

  test('returns unverified for session key bids (not blindly valid)', async () => {
    const listing = await makeSignedListing();
    const bid = await makeSignedBid(listing, {
      buyerSessionKeyData: '0x' + 'bb'.repeat(100),
    });
    const result = await validateSecondaryBid(bid, listing, DEFAULT_BID_OPTS);
    expect(result.status).toBe('unverified');
    if (result.status === 'unverified') {
      expect(result.code).toBe('SIGNATURE_UNVERIFIABLE');
      expect(result.reason).toContain('session key');
    }
  });

  test('rejects session key data that is not valid hex', async () => {
    const listing = await makeSignedListing();
    const bid = await makeSignedBid(listing, {
      buyerSessionKeyData: 'not-hex',
    });
    const result = await validateSecondaryBid(bid, listing, DEFAULT_BID_OPTS);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('INVALID_SIGNATURE');
    }
  });

  // ── Signature length validation ──────────────────────────────────────────────

  test('rejects buyer signature shorter than compact ECDSA minimum (130 chars)', async () => {
    const listing = await makeSignedListing();
    const bid = await makeSignedBid(listing, {
      buyerSignature: '0x' + 'aa'.repeat(20),
    });
    const result = await validateSecondaryBid(bid, listing, DEFAULT_BID_OPTS);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('INVALID_SIGNATURE');
    }
  });

  // ── Empty hex session key bypass ──────────────────────────────────────────────

  test('rejects empty hex buyer session key data (0x only) — prevents sig bypass', async () => {
    const listing = await makeSignedListing();
    const bid = await makeSignedBid(listing, {
      buyerSessionKeyData: '0x',
    });
    const result = await validateSecondaryBid(bid, listing, DEFAULT_BID_OPTS);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('INVALID_SIGNATURE');
    }
  });

  // ── Skipping signature verification ─────────────────────────────────────────

  test('skips signature verification when verifySignature=false', async () => {
    const listing = await makeSignedListing();
    const bid = await makeSignedBid(listing, {
      buyerSignature: '0x' + 'ff'.repeat(65),
    });
    const result = await validateSecondaryBid(bid, listing, {
      ...DEFAULT_BID_OPTS,
      verifySignature: false,
    });
    expect(result.status).toBe('valid');
  });
});
