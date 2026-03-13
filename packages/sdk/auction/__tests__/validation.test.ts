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

  test('wrong-signer EOA signature → invalid (ecrecover succeeds but wrong address)', async () => {
    const auction = makeAuctionRFQ();
    // Sign with a different key than the counterparty — ecrecover will succeed
    // but recover a different address, proving the signature is bad
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

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.code).toBe('INVALID_SIGNATURE');
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
      counterpartySignature: '0xdeadbeef00',
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
