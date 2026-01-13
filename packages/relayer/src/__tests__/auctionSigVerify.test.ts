import { describe, it, expect } from 'vitest';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { verifyAuctionSignature, generateSigningMessage } from '../auctionSigVerify';
import { createAuctionStartSiweMessage } from '@sapience/sdk';
import type { AuctionRequestPayload } from '../types';

// Generate test accounts
const takerPrivateKey = generatePrivateKey();
const takerAccount = privateKeyToAccount(takerPrivateKey);
const wrongPrivateKey = generatePrivateKey();
const wrongAccount = privateKeyToAccount(wrongPrivateKey);

const domain = 'test.sapience.xyz';
const uri = 'https://test.sapience.xyz';

// Base auction payload without signature
const baseAuction: Omit<AuctionRequestPayload, 'takerSignature' | 'takerSignedAt'> = {
  wager: '1000000000000000000',
  predictedOutcomes: ['0xdeadbeef'],
  resolver: '0x1234567890123456789012345678901234567890',
  taker: takerAccount.address,
  takerNonce: 1,
  chainId: 42161,
};

// Helper to create a signed auction payload
async function createSignedAuction(
  auction: Omit<AuctionRequestPayload, 'takerSignature' | 'takerSignedAt'>,
  account = takerAccount
): Promise<AuctionRequestPayload> {
  const takerSignedAt = new Date().toISOString();
  const message = createAuctionStartSiweMessage(
    {
      wager: auction.wager,
      predictedOutcomes: auction.predictedOutcomes,
      resolver: auction.resolver,
      taker: auction.taker,
      takerNonce: auction.takerNonce,
      chainId: auction.chainId,
    },
    domain,
    uri,
    takerSignedAt
  );

  const signature = await account.signMessage({ message });

  return {
    ...auction,
    takerSignature: signature,
    takerSignedAt,
  };
}

describe('verifyAuctionSignature', () => {
  it('returns true for valid EIP-191 signature matching taker address', async () => {
    const signedAuction = await createSignedAuction(baseAuction);
    const result = await verifyAuctionSignature(signedAuction, domain, uri);
    expect(result).toBe(true);
  });

  it('returns false when takerSignature is missing', async () => {
    const auction: AuctionRequestPayload = {
      ...baseAuction,
      takerSignedAt: new Date().toISOString(),
      // takerSignature is undefined
    };
    const result = await verifyAuctionSignature(auction, domain, uri);
    expect(result).toBe(false);
  });

  it('returns false when takerSignedAt is missing', async () => {
    const signedAuction = await createSignedAuction(baseAuction);
    const auction: AuctionRequestPayload = {
      ...signedAuction,
      takerSignedAt: undefined,
    };
    const result = await verifyAuctionSignature(auction, domain, uri);
    expect(result).toBe(false);
  });

  it('returns false when signature is from different address than taker', async () => {
    // Sign with wrong account but keep taker as takerAccount.address
    const takerSignedAt = new Date().toISOString();
    const message = createAuctionStartSiweMessage(
      {
        wager: baseAuction.wager,
        predictedOutcomes: baseAuction.predictedOutcomes,
        resolver: baseAuction.resolver,
        taker: baseAuction.taker,
        takerNonce: baseAuction.takerNonce,
        chainId: baseAuction.chainId,
      },
      domain,
      uri,
      takerSignedAt
    );
    const wrongSignature = await wrongAccount.signMessage({ message });

    const auction: AuctionRequestPayload = {
      ...baseAuction,
      takerSignature: wrongSignature,
      takerSignedAt,
    };

    const result = await verifyAuctionSignature(auction, domain, uri);
    expect(result).toBe(false);
  });

  it('returns false when nonce in signed message does not match payload', async () => {
    // Create signature with nonce 1, but change payload to nonce 2
    const signedAuction = await createSignedAuction(baseAuction);
    const modifiedAuction: AuctionRequestPayload = {
      ...signedAuction,
      takerNonce: 2, // Different from what was signed
    };

    const result = await verifyAuctionSignature(modifiedAuction, domain, uri);
    expect(result).toBe(false);
  });

  it('returns false when chainId in signed message does not match payload', async () => {
    // Create signature with chainId 42161, but change payload to chainId 1
    const signedAuction = await createSignedAuction(baseAuction);
    const modifiedAuction: AuctionRequestPayload = {
      ...signedAuction,
      chainId: 1, // Different from what was signed
    };

    const result = await verifyAuctionSignature(modifiedAuction, domain, uri);
    expect(result).toBe(false);
  });

  it('returns false for malformed signature (not valid hex)', async () => {
    const auction: AuctionRequestPayload = {
      ...baseAuction,
      takerSignature: 'not-a-valid-hex-signature',
      takerSignedAt: new Date().toISOString(),
    };

    const result = await verifyAuctionSignature(auction, domain, uri);
    expect(result).toBe(false);
  });

  it('returns false for tampered message content (modified wager)', async () => {
    const signedAuction = await createSignedAuction(baseAuction);
    const modifiedAuction: AuctionRequestPayload = {
      ...signedAuction,
      wager: '2000000000000000000', // Different wager
    };

    const result = await verifyAuctionSignature(modifiedAuction, domain, uri);
    expect(result).toBe(false);
  });

  it('handles verification exceptions gracefully (returns false, not throw)', async () => {
    const auction: AuctionRequestPayload = {
      ...baseAuction,
      takerSignature: '0x', // Invalid signature that might cause parsing errors
      takerSignedAt: new Date().toISOString(),
    };

    // Should not throw, should return false
    const result = await verifyAuctionSignature(auction, domain, uri);
    expect(result).toBe(false);
  });

  it('verifies signature with different domain correctly fails', async () => {
    const signedAuction = await createSignedAuction(baseAuction);

    // Verify with different domain should fail
    const result = await verifyAuctionSignature(signedAuction, 'other.domain.com', uri);
    expect(result).toBe(false);
  });

  it('verifies signature with lowercase taker address', async () => {
    const auctionWithLowercaseTaker = {
      ...baseAuction,
      taker: takerAccount.address.toLowerCase(),
    };
    const signedAuction = await createSignedAuction(auctionWithLowercaseTaker);

    const result = await verifyAuctionSignature(signedAuction, domain, uri);
    expect(result).toBe(true);
  });
});

describe('generateSigningMessage', () => {
  it('generates SIWE-formatted message string', () => {
    const issuedAt = '2024-01-01T00:00:00.000Z';
    const result = generateSigningMessage(baseAuction, domain, uri, issuedAt);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes all payload fields in message', () => {
    const issuedAt = '2024-01-01T00:00:00.000Z';
    const result = generateSigningMessage(baseAuction, domain, uri, issuedAt);

    expect(result).toContain(baseAuction.wager);
    expect(result).toContain(baseAuction.predictedOutcomes[0]);
    expect(result).toContain(baseAuction.resolver);
    expect(result).toContain(baseAuction.taker);
    expect(result).toContain(String(baseAuction.takerNonce));
    expect(result).toContain(String(baseAuction.chainId));
  });

  it('uses provided issuedAt timestamp', () => {
    const issuedAt = '2024-06-15T12:30:45.000Z';
    const result = generateSigningMessage(baseAuction, domain, uri, issuedAt);

    expect(result).toContain(issuedAt);
  });

  it('includes domain in message', () => {
    const issuedAt = '2024-01-01T00:00:00.000Z';
    const result = generateSigningMessage(baseAuction, domain, uri, issuedAt);

    expect(result).toContain(domain);
  });

  it('includes uri in message', () => {
    const issuedAt = '2024-01-01T00:00:00.000Z';
    const result = generateSigningMessage(baseAuction, domain, uri, issuedAt);

    expect(result).toContain(uri);
  });

  it('generates consistent message for same inputs', () => {
    const issuedAt = '2024-01-01T00:00:00.000Z';
    const result1 = generateSigningMessage(baseAuction, domain, uri, issuedAt);
    const result2 = generateSigningMessage(baseAuction, domain, uri, issuedAt);

    expect(result1).toBe(result2);
  });
});
