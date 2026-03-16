/**
 * Tests for the unified validation pre-processor.
 *
 * Uses real EIP-712 signature generation (via viem's signTypedData with
 * test accounts) to exercise the full verification pipeline.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { Address, Hex, PublicClient } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import {
  validateAuctionRFQ,
  validateBid,
  validateBidOnChain,
  validateVaultQuote,
  isActionable,
} from '../validation';
import {
  buildAuctionIntentTypedData,
  buildCounterpartyMintTypedData,
} from '../escrowSigning';
import type {
  AuctionRFQPayload,
  BidPayload,
  PickJson,
} from '../../types/escrow';

// ─── Mocks for on-chain modules (used by validateBidOnChain) ──────────────────

const mockIsNonceUsed = vi.fn();
const mockValidateCounterpartyFunds = vi.fn();

vi.mock('../../onchain/escrow', () => ({
  isNonceUsed: (...args: unknown[]) => mockIsNonceUsed(...args),
}));

vi.mock('../../onchain/position', () => ({
  validateCounterpartyFunds: (...args: unknown[]) =>
    mockValidateCounterpartyFunds(...args),
}));

// ─── Test fixtures ────────────────────────────────────────────────────────────

const VERIFYING_CONTRACT =
  '0x1111111111111111111111111111111111111111' as Address;
const CHAIN_ID = 42161;
const CONDITION_RESOLVER =
  '0x2222222222222222222222222222222222222222' as Address;
const CONDITION_ID =
  '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex;

const TEST_PICKS: PickJson[] = [
  {
    conditionResolver: CONDITION_RESOLVER,
    conditionId: CONDITION_ID,
    predictedOutcome: 1,
  },
];

const TEST_PICKS_SDK = TEST_PICKS.map((p) => ({
  conditionResolver: p.conditionResolver as Address,
  conditionId: p.conditionId as Hex,
  predictedOutcome: p.predictedOutcome,
}));

function futureDeadline(offsetSec = 3600): number {
  return Math.floor(Date.now() / 1000) + offsetSec;
}

function makeAuctionRFQ(
  overrides: Partial<AuctionRFQPayload> = {}
): AuctionRFQPayload {
  const account = privateKeyToAccount(generatePrivateKey());
  return {
    picks: TEST_PICKS,
    predictorCollateral: '1000000000000000000',
    predictor: account.address,
    predictorNonce: 1,
    predictorDeadline: futureDeadline(),
    chainId: CHAIN_ID,
    ...overrides,
  };
}

async function makeSignedAuctionRFQ(
  overrides: Partial<AuctionRFQPayload> = {}
): Promise<{
  payload: AuctionRFQPayload;
  account: ReturnType<typeof privateKeyToAccount>;
}> {
  const key = generatePrivateKey();
  const account = privateKeyToAccount(key);
  const deadline = futureDeadline();
  const nonce = 1;

  const typedData = buildAuctionIntentTypedData({
    picks: TEST_PICKS_SDK,
    predictor: account.address,
    predictorCollateral: BigInt('1000000000000000000'),
    predictorNonce: BigInt(nonce),
    predictorDeadline: BigInt(deadline),
    verifyingContract: VERIFYING_CONTRACT,
    chainId: CHAIN_ID,
  });

  const intentSignature = await account.signTypedData({
    domain: {
      ...typedData.domain,
      chainId: Number(typedData.domain.chainId),
    },
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  });

  return {
    payload: {
      picks: TEST_PICKS,
      predictorCollateral: '1000000000000000000',
      predictor: account.address,
      predictorNonce: nonce,
      predictorDeadline: deadline,
      intentSignature,
      chainId: CHAIN_ID,
      ...overrides,
    },
    account,
  };
}

async function makeSignedBid(
  auction: AuctionRFQPayload,
  overrides: Partial<BidPayload> = {}
): Promise<{
  bid: BidPayload;
  account: ReturnType<typeof privateKeyToAccount>;
}> {
  const key = generatePrivateKey();
  const account = privateKeyToAccount(key);
  const deadline = futureDeadline();
  const nonce = 42;

  const typedData = buildCounterpartyMintTypedData({
    picks: TEST_PICKS_SDK,
    predictorCollateral: BigInt(auction.predictorCollateral),
    counterpartyCollateral: BigInt('500000000000000000'),
    predictor: auction.predictor as Address,
    counterparty: account.address,
    counterpartyNonce: BigInt(nonce),
    counterpartyDeadline: BigInt(deadline),
    verifyingContract: VERIFYING_CONTRACT,
    chainId: CHAIN_ID,
  });

  const counterpartySignature = await account.signTypedData({
    domain: {
      ...typedData.domain,
      chainId: Number(typedData.domain.chainId),
    },
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  });

  return {
    bid: {
      auctionId: 'test-auction-id',
      counterparty: account.address,
      counterpartyCollateral: '500000000000000000',
      counterpartyNonce: nonce,
      counterpartyDeadline: deadline,
      counterpartySignature,
      ...overrides,
    },
    account,
  };
}

// ─── validateAuctionRFQ ───────────────────────────────────────────────────────

describe('validateAuctionRFQ', () => {
  test('valid RFQ with EOA-signed intent', async () => {
    const { payload } = await makeSignedAuctionRFQ();
    const result = await validateAuctionRFQ(payload, {
      verifyingContract: VERIFYING_CONTRACT,
      chainId: CHAIN_ID,
    });

    expect(result.status).toBe('valid');
    expect(isActionable(result)).toBe(true);
    if (result.status === 'valid') {
      expect(result.recoveredSigner).toBeDefined();
    }
  });

  test('missing picks → invalid', async () => {
    const payload = makeAuctionRFQ({ picks: [] });
    const result = await validateAuctionRFQ(payload, {
      verifyingContract: VERIFYING_CONTRACT,
    });

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('INVALID_PICKS');
    }
  });

  test('malformed pick → invalid', async () => {
    const payload = makeAuctionRFQ({
      picks: [
        { conditionResolver: 'bad', conditionId: '0x1', predictedOutcome: 5 },
      ],
    });
    const result = await validateAuctionRFQ(payload, {
      verifyingContract: VERIFYING_CONTRACT,
    });

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('INVALID_PICKS');
    }
  });

  test('expired deadline → invalid', async () => {
    const payload = makeAuctionRFQ({
      predictorDeadline: Math.floor(Date.now() / 1000) - 100,
    });
    const result = await validateAuctionRFQ(payload, {
      verifyingContract: VERIFYING_CONTRACT,
    });

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('EXPIRED_DEADLINE');
    }
  });

  test('deadline too far in future → invalid', async () => {
    const payload = makeAuctionRFQ({
      predictorDeadline: Math.floor(Date.now() / 1000) + 100000,
    });
    const result = await validateAuctionRFQ(payload, {
      verifyingContract: VERIFYING_CONTRACT,
      maxDeadlineSeconds: 7200,
    });

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('DEADLINE_TOO_FAR');
    }
  });

  test('missing predictor address → invalid', async () => {
    const payload = makeAuctionRFQ({ predictor: '' });
    const result = await validateAuctionRFQ(payload, {
      verifyingContract: VERIFYING_CONTRACT,
    });

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('MISSING_FIELD');
    }
  });

  test('missing predictorCollateral → invalid', async () => {
    const payload = makeAuctionRFQ({ predictorCollateral: '' });
    const result = await validateAuctionRFQ(payload, {
      verifyingContract: VERIFYING_CONTRACT,
    });

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('MISSING_FIELD');
    }
  });

  test('zero predictorCollateral → invalid', async () => {
    const payload = makeAuctionRFQ({ predictorCollateral: '0' });
    const result = await validateAuctionRFQ(payload, {
      verifyingContract: VERIFYING_CONTRACT,
    });

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('MISSING_FIELD');
    }
  });

  test('invalid chainId → invalid', async () => {
    const payload = makeAuctionRFQ({ chainId: 0 });
    const result = await validateAuctionRFQ(payload, {
      verifyingContract: VERIFYING_CONTRACT,
    });

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('MISSING_FIELD');
    }
  });

  test('chain mismatch → invalid', async () => {
    const payload = makeAuctionRFQ({ chainId: 1 });
    const result = await validateAuctionRFQ(payload, {
      verifyingContract: VERIFYING_CONTRACT,
      chainId: 42161,
    });

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('CHAIN_MISMATCH');
    }
  });

  test('no signature + requireSignature=true → invalid', async () => {
    const payload = makeAuctionRFQ();
    // No intentSignature
    const result = await validateAuctionRFQ(payload, {
      verifyingContract: VERIFYING_CONTRACT,
      requireSignature: true,
    });

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('INVALID_SIGNATURE');
    }
  });

  test('no signature + requireSignature=false → valid', async () => {
    const payload = makeAuctionRFQ();
    const result = await validateAuctionRFQ(payload, {
      verifyingContract: VERIFYING_CONTRACT,
      requireSignature: false,
    });

    expect(result.status).toBe('valid');
  });

  test('signed payload + requireSignature=false → still valid (flag does not break signed payloads)', async () => {
    const { payload } = await makeSignedAuctionRFQ();
    const result = await validateAuctionRFQ(payload, {
      verifyingContract: VERIFYING_CONTRACT,
      chainId: CHAIN_ID,
      requireSignature: false,
    });

    // When requireSignature=false, the signature is not checked at all —
    // the payload passes on field validation alone
    expect(result.status).toBe('valid');
  });

  test('bad signature → invalid', async () => {
    const payload = makeAuctionRFQ({
      intentSignature:
        '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef1c',
    });
    const result = await validateAuctionRFQ(payload, {
      verifyingContract: VERIFYING_CONTRACT,
      chainId: CHAIN_ID,
    });

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('INVALID_SIGNATURE');
    }
  });

  test('invalid predictorNonce → invalid', async () => {
    const payload = makeAuctionRFQ({ predictorNonce: -1 });
    const result = await validateAuctionRFQ(payload, {
      verifyingContract: VERIFYING_CONTRACT,
    });

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('MISSING_FIELD');
    }
  });
});

// ─── validateBid ──────────────────────────────────────────────────────────────

describe('validateBid', () => {
  test('valid signed bid (EOA counterparty)', async () => {
    const { payload: auction } = await makeSignedAuctionRFQ();
    const { bid } = await makeSignedBid(auction);

    const result = await validateBid(bid, auction, {
      verifyingContract: VERIFYING_CONTRACT,
      chainId: CHAIN_ID,
    });

    expect(result.status).toBe('valid');
    if (result.status === 'valid') {
      expect(result.recoveredSigner).toBeDefined();
    }
  });

  test('missing auctionId → invalid', async () => {
    const auction = makeAuctionRFQ();
    const { bid } = await makeSignedBid(auction, { auctionId: '' });

    const result = await validateBid(bid, auction, {
      verifyingContract: VERIFYING_CONTRACT,
      chainId: CHAIN_ID,
    });

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('MISSING_FIELD');
    }
  });

  test('invalid counterparty address → invalid', async () => {
    const auction = makeAuctionRFQ();
    const { bid } = await makeSignedBid(auction, {
      counterparty: 'not-an-address',
    });

    const result = await validateBid(bid, auction, {
      verifyingContract: VERIFYING_CONTRACT,
      chainId: CHAIN_ID,
    });

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('MISSING_FIELD');
    }
  });

  test('expired counterpartyDeadline → invalid', async () => {
    const auction = makeAuctionRFQ();
    const { bid } = await makeSignedBid(auction, {
      counterpartyDeadline: Math.floor(Date.now() / 1000) - 100,
    });

    const result = await validateBid(bid, auction, {
      verifyingContract: VERIFYING_CONTRACT,
      chainId: CHAIN_ID,
    });

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('EXPIRED_DEADLINE');
    }
  });

  test('missing counterpartyCollateral → invalid', async () => {
    const auction = makeAuctionRFQ();
    const { bid } = await makeSignedBid(auction, {
      counterpartyCollateral: '',
    });

    const result = await validateBid(bid, auction, {
      verifyingContract: VERIFYING_CONTRACT,
      chainId: CHAIN_ID,
    });

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('MISSING_FIELD');
    }
  });

  test('wrong-signer EOA signature without publicClient → unverified (could be smart contract signer)', async () => {
    const auction = makeAuctionRFQ();
    // Sign with a different key than the counterparty — ecrecover will succeed
    // but recover a different address. Without a publicClient we can't rule out
    // ERC-1271 / wrapped signing schemes, so this is 'unverified' not 'invalid'.
    const wrongKey = generatePrivateKey();
    const wrongAccount = privateKeyToAccount(wrongKey);

    const { bid: baseBid } = await makeSignedBid(auction);

    // Re-sign with wrong key
    const typedData = buildCounterpartyMintTypedData({
      picks: TEST_PICKS_SDK,
      predictorCollateral: BigInt(auction.predictorCollateral),
      counterpartyCollateral: BigInt(baseBid.counterpartyCollateral),
      predictor: auction.predictor as Address,
      counterparty: baseBid.counterparty as Address,
      counterpartyNonce: BigInt(baseBid.counterpartyNonce),
      counterpartyDeadline: BigInt(baseBid.counterpartyDeadline),
      verifyingContract: VERIFYING_CONTRACT,
      chainId: CHAIN_ID,
    });

    const wrongSignature = await wrongAccount.signTypedData({
      domain: {
        ...typedData.domain,
        chainId: Number(typedData.domain.chainId),
      },
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: typedData.message,
    });

    const result = await validateBid(
      { ...baseBid, counterpartySignature: wrongSignature },
      auction,
      {
        verifyingContract: VERIFYING_CONTRACT,
        chainId: CHAIN_ID,
      }
    );

    expect(result.status).toBe('unverified');
    if (result.status === 'unverified') {
      expect(result.code).toBe('SIGNATURE_UNVERIFIABLE');
    }
  });

  test('malformed signature (ecrecover fails) without publicClient → unverified', async () => {
    const auction = makeAuctionRFQ();
    const { bid } = await makeSignedBid(auction, {
      counterpartySignature:
        '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef1c',
    });

    const result = await validateBid(bid, auction, {
      verifyingContract: VERIFYING_CONTRACT,
      chainId: CHAIN_ID,
    });

    // No publicClient — can't try ERC-1271, so unverified
    expect(result.status).toBe('unverified');
  });

  test('verifySignature=false skips signature check', async () => {
    const auction = makeAuctionRFQ();
    const { bid } = await makeSignedBid(auction, {
      counterpartySignature:
        '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef1c',
    });

    const result = await validateBid(bid, auction, {
      verifyingContract: VERIFYING_CONTRACT,
      chainId: CHAIN_ID,
      verifySignature: false,
    });

    expect(result.status).toBe('valid');
  });

  test('invalid signature format → invalid', async () => {
    const auction = makeAuctionRFQ();
    const { bid } = await makeSignedBid(auction, {
      counterpartySignature: 'not-a-signature',
    });

    const result = await validateBid(bid, auction, {
      verifyingContract: VERIFYING_CONTRACT,
      chainId: CHAIN_ID,
    });

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('INVALID_SIGNATURE');
    }
  });

  test('ERC-1271 fallback with publicClient → valid when magic returned', async () => {
    const auction = makeAuctionRFQ();
    const { bid } = await makeSignedBid(auction, {
      counterpartySignature:
        '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef1c',
    });

    const mockPublicClient = {
      readContract: vi.fn().mockResolvedValue('0x1626ba7e'),
    } as unknown as PublicClient;

    const result = await validateBid(bid, auction, {
      verifyingContract: VERIFYING_CONTRACT,
      chainId: CHAIN_ID,
      publicClient: mockPublicClient,
    });

    expect(result.status).toBe('valid');
  });

  test('ERC-1271 fallback → unverified when wrong value returned', async () => {
    const auction = makeAuctionRFQ();
    const { bid } = await makeSignedBid(auction, {
      counterpartySignature:
        '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef1c',
    });

    const mockPublicClient = {
      readContract: vi.fn().mockResolvedValue('0x00000000'),
    } as unknown as PublicClient;

    const result = await validateBid(bid, auction, {
      verifyingContract: VERIFYING_CONTRACT,
      chainId: CHAIN_ID,
      publicClient: mockPublicClient,
    });

    expect(result.status).toBe('unverified');
  });

  test('ERC-1271 fallback → unverified when call reverts', async () => {
    const auction = makeAuctionRFQ();
    const { bid } = await makeSignedBid(auction, {
      counterpartySignature:
        '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef1c',
    });

    const mockPublicClient = {
      readContract: vi.fn().mockRejectedValue(new Error('execution reverted')),
    } as unknown as PublicClient;

    const result = await validateBid(bid, auction, {
      verifyingContract: VERIFYING_CONTRACT,
      chainId: CHAIN_ID,
      publicClient: mockPublicClient,
    });

    expect(result.status).toBe('unverified');
  });

  test('zero counterpartyCollateral → invalid', async () => {
    const auction = makeAuctionRFQ();
    const { bid } = await makeSignedBid(auction, {
      counterpartyCollateral: '0',
    });

    const result = await validateBid(bid, auction, {
      verifyingContract: VERIFYING_CONTRACT,
      chainId: CHAIN_ID,
    });

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('MISSING_FIELD');
    }
  });

  test('invalid counterpartyNonce → invalid', async () => {
    const auction = makeAuctionRFQ();
    const { bid } = await makeSignedBid(auction, {
      counterpartyNonce: -1,
    });

    const result = await validateBid(bid, auction, {
      verifyingContract: VERIFYING_CONTRACT,
      chainId: CHAIN_ID,
    });

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('MISSING_FIELD');
    }
  });
});

// ─── validateVaultQuote ───────────────────────────────────────────────────────

describe('validateVaultQuote', () => {
  test('missing vaultAddress → invalid', async () => {
    const result = await validateVaultQuote({
      chainId: CHAIN_ID,
      timestamp: Date.now(),
      vaultCollateralPerShare: '1.0',
      signedBy: VERIFYING_CONTRACT,
      signature: '0xdead',
    });

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('MISSING_FIELD');
    }
  });

  test('missing chainId → invalid', async () => {
    const result = await validateVaultQuote({
      vaultAddress: VERIFYING_CONTRACT,
      timestamp: Date.now(),
      vaultCollateralPerShare: '1.0',
      signedBy: VERIFYING_CONTRACT,
      signature: '0xdead',
    });

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('MISSING_FIELD');
    }
  });

  test('stale timestamp → invalid', async () => {
    const result = await validateVaultQuote({
      vaultAddress: VERIFYING_CONTRACT,
      chainId: CHAIN_ID,
      timestamp: Date.now() - 10 * 60 * 1000, // 10 min ago
      vaultCollateralPerShare: '1.0',
      signedBy: VERIFYING_CONTRACT,
      signature: '0xdead',
    });

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('EXPIRED_DEADLINE');
    }
  });

  test('future timestamp beyond window → invalid', async () => {
    const result = await validateVaultQuote({
      vaultAddress: VERIFYING_CONTRACT,
      chainId: CHAIN_ID,
      timestamp: Date.now() + 10 * 60 * 1000, // 10 min in the future
      vaultCollateralPerShare: '1.0',
      signedBy: VERIFYING_CONTRACT,
      signature: '0xdead',
    });

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('EXPIRED_DEADLINE');
      expect(result.reason).toContain('outside acceptable window');
    }
  });

  test('missing signedBy → invalid', async () => {
    const result = await validateVaultQuote({
      vaultAddress: VERIFYING_CONTRACT,
      chainId: CHAIN_ID,
      timestamp: Date.now(),
      vaultCollateralPerShare: '1.0',
      signature: '0xdead',
    });

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('MISSING_FIELD');
    }
  });

  test('valid signed vault quote', async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const vaultAddress =
      '0x3333333333333333333333333333333333333333' as Address;
    const timestamp = Date.now();
    const vaultCollateralPerShare = '1.234567';

    const message = [
      'Sapience Vault Share Quote',
      `Vault: ${vaultAddress.toLowerCase()}`,
      `ChainId: ${CHAIN_ID}`,
      `CollateralPerShare: ${vaultCollateralPerShare}`,
      `Timestamp: ${timestamp}`,
    ].join('\n');

    const signature = await account.signMessage({ message });

    const result = await validateVaultQuote({
      vaultAddress,
      chainId: CHAIN_ID,
      timestamp,
      vaultCollateralPerShare,
      signedBy: account.address,
      signature,
    });

    expect(result.status).toBe('valid');
    if (result.status === 'valid') {
      expect(result.recoveredSigner?.toLowerCase()).toBe(
        account.address.toLowerCase()
      );
    }
  });

  test('bad vault quote signature → invalid', async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const otherAccount = privateKeyToAccount(generatePrivateKey());
    const vaultAddress =
      '0x3333333333333333333333333333333333333333' as Address;
    const timestamp = Date.now();
    const vaultCollateralPerShare = '1.234567';

    // Sign with otherAccount but claim signedBy is account
    const message = [
      'Sapience Vault Share Quote',
      `Vault: ${vaultAddress.toLowerCase()}`,
      `ChainId: ${CHAIN_ID}`,
      `CollateralPerShare: ${vaultCollateralPerShare}`,
      `Timestamp: ${timestamp}`,
    ].join('\n');

    const signature = await otherAccount.signMessage({ message });

    const result = await validateVaultQuote({
      vaultAddress,
      chainId: CHAIN_ID,
      timestamp,
      vaultCollateralPerShare,
      signedBy: account.address,
      signature,
    });

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('INVALID_SIGNATURE');
    }
  });
});

// ─── isActionable helper ──────────────────────────────────────────────────────

describe('isActionable', () => {
  test('valid → true', () => {
    expect(isActionable({ status: 'valid' })).toBe(true);
  });

  test('invalid → false', () => {
    expect(
      isActionable({ status: 'invalid', code: 'MISSING_FIELD', reason: 'test' })
    ).toBe(false);
  });

  test('unverified → false', () => {
    expect(
      isActionable({
        status: 'unverified',
        code: 'SIGNATURE_UNVERIFIABLE',
        reason: 'test',
      })
    ).toBe(false);
  });
});

// ─── validateBidOnChain ──────────────────────────────────────────────────────

describe('validateBidOnChain', () => {
  const PREDICTION_MARKET =
    '0x4444444444444444444444444444444444444444' as Address;
  const COLLATERAL_TOKEN =
    '0x5555555555555555555555555555555555555555' as Address;

  function makeBidOnChain(
    overrides: Partial<{
      counterparty: string;
      counterpartyCollateral: string;
      counterpartyNonce: number;
      counterpartyDeadline: number;
      counterpartySignature: string;
      counterpartySessionKeyData: string;
    }> = {}
  ) {
    const account = privateKeyToAccount(generatePrivateKey());
    return {
      counterparty: account.address,
      counterpartyCollateral: '500000000000000000',
      counterpartyNonce: 42,
      counterpartyDeadline: futureDeadline(),
      counterpartySignature:
        '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef1c',
      ...overrides,
    };
  }

  const auctionCtx = {
    predictor: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    predictorCollateral: '1000000000000000000',
    predictorNonce: 7,
    picks: TEST_PICKS,
  };

  let mockPublicClient: { readContract: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPublicClient = {
      readContract: vi.fn().mockResolvedValue(true),
    };
    mockIsNonceUsed.mockResolvedValue(false);
    mockValidateCounterpartyFunds.mockResolvedValue(undefined);
  });

  test('valid bid — on-chain sig verification + nonce + funds all pass', async () => {
    const bid = makeBidOnChain();
    const result = await validateBidOnChain(bid, auctionCtx, {
      chainId: CHAIN_ID,
      predictionMarketAddress: PREDICTION_MARKET,
      collateralTokenAddress: COLLATERAL_TOKEN,
      publicClient: mockPublicClient as unknown as PublicClient,
    });

    expect(result.status).toBe('valid');
    expect(mockPublicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'verifyMintPartySignature',
      })
    );
    expect(mockIsNonceUsed).toHaveBeenCalled();
    expect(mockValidateCounterpartyFunds).toHaveBeenCalled();
  });

  test('invalid signature — verifyMintPartySignature returns false for EOA', async () => {
    mockPublicClient.readContract.mockResolvedValue(false);
    // Mock getCode to return '0x' (EOA — no contract code)
    mockPublicClient.getCode = vi.fn().mockResolvedValue('0x');
    const bid = makeBidOnChain();
    const result = await validateBidOnChain(bid, auctionCtx, {
      chainId: CHAIN_ID,
      predictionMarketAddress: PREDICTION_MARKET,
      collateralTokenAddress: COLLATERAL_TOKEN,
      publicClient: mockPublicClient as unknown as PublicClient,
    });

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('INVALID_SIGNATURE');
    }
    // Should not proceed to nonce/balance checks
    expect(mockIsNonceUsed).not.toHaveBeenCalled();
  });

  test('unverified signature — verifyMintPartySignature returns false for smart contract counterparty', async () => {
    mockPublicClient.readContract.mockResolvedValue(false);
    // Mock getCode to return bytecode (smart contract — e.g. vault)
    mockPublicClient.getCode = vi.fn().mockResolvedValue('0x6080604052');
    const bid = makeBidOnChain();
    const result = await validateBidOnChain(bid, auctionCtx, {
      chainId: CHAIN_ID,
      predictionMarketAddress: PREDICTION_MARKET,
      collateralTokenAddress: COLLATERAL_TOKEN,
      publicClient: mockPublicClient as unknown as PublicClient,
    });

    // Smart contract counterparties use wrapped signatures (ERC-1271)
    // that verifyMintPartySignature may not handle correctly off-chain.
    // Treat as unverified rather than invalid — the on-chain mint() is the authority.
    expect(result.status).toBe('unverified');
    if (result.status === 'unverified') {
      expect(result.code).toBe('SIGNATURE_UNVERIFIABLE');
    }
    // Should still proceed to nonce/balance checks
    expect(mockIsNonceUsed).toHaveBeenCalled();
  });

  test('expired deadline → invalid before any RPC calls', async () => {
    const bid = makeBidOnChain({
      counterpartyDeadline: Math.floor(Date.now() / 1000) - 100,
    });
    const result = await validateBidOnChain(bid, auctionCtx, {
      chainId: CHAIN_ID,
      predictionMarketAddress: PREDICTION_MARKET,
      collateralTokenAddress: COLLATERAL_TOKEN,
      publicClient: mockPublicClient as unknown as PublicClient,
    });

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('EXPIRED_DEADLINE');
    }
    expect(mockPublicClient.readContract).not.toHaveBeenCalled();
  });

  test('used nonce → invalid', async () => {
    mockIsNonceUsed.mockResolvedValue(true);
    const bid = makeBidOnChain();
    const result = await validateBidOnChain(bid, auctionCtx, {
      chainId: CHAIN_ID,
      predictionMarketAddress: PREDICTION_MARKET,
      collateralTokenAddress: COLLATERAL_TOKEN,
      publicClient: mockPublicClient as unknown as PublicClient,
    });

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('NONCE_USED');
    }
  });

  test('insufficient funds → invalid', async () => {
    mockValidateCounterpartyFunds.mockRejectedValue(
      new Error('The market maker has insufficient wUSDe balance')
    );
    const bid = makeBidOnChain();
    const result = await validateBidOnChain(bid, auctionCtx, {
      chainId: CHAIN_ID,
      predictionMarketAddress: PREDICTION_MARKET,
      collateralTokenAddress: COLLATERAL_TOKEN,
      publicClient: mockPublicClient as unknown as PublicClient,
    });

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('INSUFFICIENT_BALANCE');
    }
  });

  test('RPC error + failOpen=true (default) → valid', async () => {
    mockPublicClient.readContract.mockRejectedValue(
      new Error('network timeout')
    );
    const bid = makeBidOnChain();
    const result = await validateBidOnChain(bid, auctionCtx, {
      chainId: CHAIN_ID,
      predictionMarketAddress: PREDICTION_MARKET,
      collateralTokenAddress: COLLATERAL_TOKEN,
      publicClient: mockPublicClient as unknown as PublicClient,
    });

    expect(result.status).toBe('valid');
  });

  test('RPC error + failOpen=false → invalid', async () => {
    mockPublicClient.readContract.mockRejectedValue(
      new Error('network timeout')
    );
    const bid = makeBidOnChain();
    const result = await validateBidOnChain(bid, auctionCtx, {
      chainId: CHAIN_ID,
      predictionMarketAddress: PREDICTION_MARKET,
      collateralTokenAddress: COLLATERAL_TOKEN,
      publicClient: mockPublicClient as unknown as PublicClient,
      failOpen: false,
    });

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('RPC_ERROR');
    }
  });

  test('skipSignatureVerification=true → skips readContract', async () => {
    const bid = makeBidOnChain();
    const result = await validateBidOnChain(bid, auctionCtx, {
      chainId: CHAIN_ID,
      predictionMarketAddress: PREDICTION_MARKET,
      collateralTokenAddress: COLLATERAL_TOKEN,
      publicClient: mockPublicClient as unknown as PublicClient,
      skipSignatureVerification: true,
    });

    expect(result.status).toBe('valid');
    expect(mockPublicClient.readContract).not.toHaveBeenCalled();
    expect(mockIsNonceUsed).toHaveBeenCalled();
  });

  test('checkPredictor defaults to false — only checks counterparty solvency', async () => {
    const bid = makeBidOnChain();
    await validateBidOnChain(bid, auctionCtx, {
      chainId: CHAIN_ID,
      predictionMarketAddress: PREDICTION_MARKET,
      collateralTokenAddress: COLLATERAL_TOKEN,
      publicClient: mockPublicClient as unknown as PublicClient,
    });

    // validateCounterpartyFunds should be called once (counterparty only)
    expect(mockValidateCounterpartyFunds).toHaveBeenCalledTimes(1);
  });

  test('checkPredictor=true checks both parties', async () => {
    const bid = makeBidOnChain();
    await validateBidOnChain(bid, auctionCtx, {
      chainId: CHAIN_ID,
      predictionMarketAddress: PREDICTION_MARKET,
      collateralTokenAddress: COLLATERAL_TOKEN,
      publicClient: mockPublicClient as unknown as PublicClient,
      checkPredictor: true,
    });

    // validateCounterpartyFunds called twice: counterparty + predictor
    expect(mockValidateCounterpartyFunds).toHaveBeenCalledTimes(2);
  });

  test('used predictor nonce → invalid', async () => {
    // First call (counterparty nonce) → not used; second call (predictor nonce) → used
    mockIsNonceUsed.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const bid = makeBidOnChain();
    const result = await validateBidOnChain(bid, auctionCtx, {
      chainId: CHAIN_ID,
      predictionMarketAddress: PREDICTION_MARKET,
      collateralTokenAddress: COLLATERAL_TOKEN,
      publicClient: mockPublicClient as unknown as PublicClient,
    });

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('NONCE_USED');
      expect(result.reason).toContain('Predictor');
    }
  });

  test('predictor nonce checked with correct address and value', async () => {
    const bid = makeBidOnChain();
    await validateBidOnChain(bid, auctionCtx, {
      chainId: CHAIN_ID,
      predictionMarketAddress: PREDICTION_MARKET,
      collateralTokenAddress: COLLATERAL_TOKEN,
      publicClient: mockPublicClient as unknown as PublicClient,
    });

    // isNonceUsed should be called for both counterparty and predictor
    expect(mockIsNonceUsed).toHaveBeenCalledTimes(2);
    // Second call should be for the predictor
    expect(mockIsNonceUsed).toHaveBeenCalledWith(
      auctionCtx.predictor,
      BigInt(auctionCtx.predictorNonce),
      expect.objectContaining({
        chainId: CHAIN_ID,
        marketAddress: PREDICTION_MARKET,
      })
    );
  });

  test('predictorNonce omitted → skips predictor nonce check', async () => {
    const auctionWithoutNonce = {
      predictor: auctionCtx.predictor,
      predictorCollateral: auctionCtx.predictorCollateral,
      picks: auctionCtx.picks,
    };
    const bid = makeBidOnChain();
    const result = await validateBidOnChain(bid, auctionWithoutNonce, {
      chainId: CHAIN_ID,
      predictionMarketAddress: PREDICTION_MARKET,
      collateralTokenAddress: COLLATERAL_TOKEN,
      publicClient: mockPublicClient as unknown as PublicClient,
    });

    expect(result.status).toBe('valid');
    // isNonceUsed called only once (counterparty)
    expect(mockIsNonceUsed).toHaveBeenCalledTimes(1);
  });
});
