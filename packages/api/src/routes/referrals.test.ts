import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before the router import
// ---------------------------------------------------------------------------

const mockPrisma = {
  legacyPosition: { findMany: vi.fn() },
  referralCode: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
};

vi.mock('../db', () => ({ default: mockPrisma }));

vi.mock('viem', async () => {
  const actual = await vi.importActual('viem');
  return {
    ...actual,
    recoverMessageAddress: vi.fn(),
  };
});

vi.mock('../services/sponsorship', () => ({
  grantSponsorshipBudget: vi.fn().mockResolvedValue('0xmocktxhash'),
}));

vi.mock('../middleware', () => ({
  adminAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../helpers', () => ({
  hashReferralCode: vi
    .fn()
    .mockReturnValue(('0x' + 'ab'.repeat(32)) as `0x${string}`),
}));

// ---------------------------------------------------------------------------
// Import the mocked module so we can control its return value per-test
// ---------------------------------------------------------------------------

import { recoverMessageAddress } from 'viem';
import { grantSponsorshipBudget } from '../services/sponsorship';

const mockRecoverMessageAddress = recoverMessageAddress as ReturnType<
  typeof vi.fn
>;
const mockGrantSponsorshipBudget = grantSponsorshipBudget as ReturnType<
  typeof vi.fn
>;

// ---------------------------------------------------------------------------
// Set up Express app with the router under test
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

const { router } = await import('./referrals');
app.use('/referrals', router);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WALLET = '0xUserAddress';
const OTHER_WALLET = '0xOtherAddress';
const VALID_SIG = '0xdeadbeef' as `0x${string}`;
const CODE_HASH = ('0x' + 'ab'.repeat(32)) as `0x${string}`;

/** Returns positions whose total collateral exceeds the 5 000 * 10^18 volume threshold. */
function highVolumePositions(address: string) {
  return [
    {
      predictor: address,
      counterparty: '0xother',
      predictorCollateral: (BigInt(6000) * BigInt(10 ** 18)).toString(),
      counterpartyCollateral: '0',
    },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /referrals/code', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/referrals/code')
      .send({ walletAddress: WALLET });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/required/i);
  });

  it('returns 401 when signature is invalid', async () => {
    mockRecoverMessageAddress.mockResolvedValue('0xDIFFERENTADDRESS');

    const res = await request(app).post('/referrals/code').send({
      walletAddress: WALLET,
      codePlaintext: 'CODE1',
      signature: VALID_SIG,
    });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid signature/i);
  });

  it('returns 403 when volume is below threshold', async () => {
    mockRecoverMessageAddress.mockResolvedValue(WALLET);
    mockPrisma.legacyPosition.findMany.mockResolvedValue([]);

    const res = await request(app).post('/referrals/code').send({
      walletAddress: WALLET,
      codePlaintext: 'CODE1',
      signature: VALID_SIG,
    });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/insufficient trading volume/i);
  });

  it('returns 200 idempotently when user already owns the hash', async () => {
    mockRecoverMessageAddress.mockResolvedValue(WALLET);
    mockPrisma.legacyPosition.findMany.mockResolvedValue(
      highVolumePositions(WALLET)
    );
    mockPrisma.referralCode.findFirst.mockResolvedValue({
      codeHash: CODE_HASH,
      createdBy: WALLET.toLowerCase(),
      maxClaims: 5,
      creatorType: 'user',
    });

    const res = await request(app).post('/referrals/code').send({
      walletAddress: WALLET,
      codePlaintext: 'CODE1',
      signature: VALID_SIG,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      codeHash: CODE_HASH,
      maxClaims: 5,
      creatorType: 'user',
    });
  });

  it('returns 400 when a different user already owns the hash', async () => {
    mockRecoverMessageAddress.mockResolvedValue(WALLET);
    mockPrisma.legacyPosition.findMany.mockResolvedValue(
      highVolumePositions(WALLET)
    );
    mockPrisma.referralCode.findFirst.mockResolvedValue({
      codeHash: CODE_HASH,
      createdBy: OTHER_WALLET.toLowerCase(),
      maxClaims: 5,
      creatorType: 'user',
    });

    const res = await request(app).post('/referrals/code').send({
      walletAddress: WALLET,
      codePlaintext: 'CODE1',
      signature: VALID_SIG,
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/choose a different code/i);
  });

  it('updates existing user code and returns 200', async () => {
    mockRecoverMessageAddress.mockResolvedValue(WALLET);
    mockPrisma.legacyPosition.findMany.mockResolvedValue(
      highVolumePositions(WALLET)
    );

    // No hash collision
    mockPrisma.referralCode.findFirst
      .mockResolvedValueOnce(null) // first call: no existing hash
      .mockResolvedValueOnce({
        // second call: user already has a code
        id: 42,
        codeHash: '0xoldold',
        createdBy: WALLET.toLowerCase(),
        creatorType: 'user',
        maxClaims: 5,
      });

    mockPrisma.referralCode.update.mockResolvedValue({
      codeHash: CODE_HASH,
      maxClaims: 5,
      creatorType: 'user',
    });

    const res = await request(app).post('/referrals/code').send({
      walletAddress: WALLET,
      codePlaintext: 'NEWCODE',
      signature: VALID_SIG,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      codeHash: CODE_HASH,
      maxClaims: 5,
      creatorType: 'user',
    });
    expect(mockPrisma.referralCode.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 42 },
        data: { codeHash: CODE_HASH },
      })
    );
  });

  it('creates a new code with maxClaims=5 and creatorType=user', async () => {
    mockRecoverMessageAddress.mockResolvedValue(WALLET);
    mockPrisma.legacyPosition.findMany.mockResolvedValue(
      highVolumePositions(WALLET)
    );
    mockPrisma.referralCode.findFirst.mockResolvedValue(null); // no collision, no existing
    mockPrisma.referralCode.create.mockResolvedValue({
      codeHash: CODE_HASH,
      maxClaims: 5,
      creatorType: 'user',
    });

    const res = await request(app).post('/referrals/code').send({
      walletAddress: WALLET,
      codePlaintext: 'FRESH',
      signature: VALID_SIG,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      codeHash: CODE_HASH,
      maxClaims: 5,
      creatorType: 'user',
    });
    expect(mockPrisma.referralCode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        maxClaims: 5,
        creatorType: 'user',
        isActive: true,
      }),
    });
  });
});

describe('POST /referrals/claim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/referrals/claim')
      .send({ walletAddress: WALLET });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/required/i);
  });

  it('returns 401 when signature is invalid', async () => {
    mockRecoverMessageAddress.mockResolvedValue('0xDIFFERENTADDRESS');

    const res = await request(app).post('/referrals/claim').send({
      walletAddress: WALLET,
      codePlaintext: 'CODE1',
      signature: VALID_SIG,
    });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/could not be verified/i);
  });

  it('returns 200 idempotently when user already claimed the same code', async () => {
    mockRecoverMessageAddress.mockResolvedValue(WALLET);
    mockPrisma.user.findUnique.mockResolvedValue({
      address: WALLET.toLowerCase(),
      referredByCodeId: 7,
    });
    mockPrisma.referralCode.findFirst.mockResolvedValue({
      id: 7,
      codeHash: CODE_HASH,
      creatorType: 'user',
    });

    const res = await request(app).post('/referrals/claim').send({
      walletAddress: WALLET,
      codePlaintext: 'CODE1',
      signature: VALID_SIG,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ allowed: true, codeId: 7, creatorType: 'user' });
  });

  it('returns 409 when user already claimed a different code', async () => {
    mockRecoverMessageAddress.mockResolvedValue(WALLET);
    mockPrisma.user.findUnique.mockResolvedValue({
      address: WALLET.toLowerCase(),
      referredByCodeId: 99,
    });
    mockPrisma.referralCode.findFirst.mockResolvedValue({
      id: 7, // different from 99
      codeHash: CODE_HASH,
    });

    const res = await request(app).post('/referrals/claim').send({
      walletAddress: WALLET,
      codePlaintext: 'CODE1',
      signature: VALID_SIG,
    });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already claimed/i);
  });

  it('returns 404 when code is not found', async () => {
    mockRecoverMessageAddress.mockResolvedValue(WALLET);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.referralCode.findFirst.mockResolvedValue(null);

    const res = await request(app).post('/referrals/claim').send({
      walletAddress: WALLET,
      codePlaintext: 'BADCODE',
      signature: VALID_SIG,
    });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });

  it('returns 403 when code is inactive', async () => {
    mockRecoverMessageAddress.mockResolvedValue(WALLET);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.referralCode.findFirst.mockResolvedValue({
      id: 1,
      codeHash: CODE_HASH,
      isActive: false,
      createdBy: OTHER_WALLET.toLowerCase(),
      maxClaims: 5,
      expiresAt: null,
      _count: { claimedBy: 0 },
    });

    const res = await request(app).post('/referrals/claim').send({
      walletAddress: WALLET,
      codePlaintext: 'CODE1',
      signature: VALID_SIG,
    });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/deactivated/i);
  });

  it('returns 403 when code is expired', async () => {
    mockRecoverMessageAddress.mockResolvedValue(WALLET);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.referralCode.findFirst.mockResolvedValue({
      id: 1,
      codeHash: CODE_HASH,
      isActive: true,
      createdBy: OTHER_WALLET.toLowerCase(),
      maxClaims: 5,
      expiresAt: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      _count: { claimedBy: 0 },
    });

    const res = await request(app).post('/referrals/claim').send({
      walletAddress: WALLET,
      codePlaintext: 'CODE1',
      signature: VALID_SIG,
    });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/expired/i);
  });

  it('returns 403 when max claims reached', async () => {
    mockRecoverMessageAddress.mockResolvedValue(WALLET);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.referralCode.findFirst.mockResolvedValue({
      id: 1,
      codeHash: CODE_HASH,
      isActive: true,
      createdBy: OTHER_WALLET.toLowerCase(),
      maxClaims: 5,
      expiresAt: null,
      _count: { claimedBy: 5 },
    });

    const res = await request(app).post('/referrals/claim').send({
      walletAddress: WALLET,
      codePlaintext: 'CODE1',
      signature: VALID_SIG,
    });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/claim limit/i);
  });

  it('returns 400 on self-referral', async () => {
    mockRecoverMessageAddress.mockResolvedValue(WALLET);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.referralCode.findFirst.mockResolvedValue({
      id: 1,
      codeHash: CODE_HASH,
      isActive: true,
      createdBy: WALLET.toLowerCase(),
      maxClaims: 5,
      expiresAt: null,
      _count: { claimedBy: 0 },
    });

    const res = await request(app).post('/referrals/claim').send({
      walletAddress: WALLET,
      codePlaintext: 'CODE1',
      signature: VALID_SIG,
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/own invite code/i);
  });

  it('returns 200 on successful claim with sponsorTxHash', async () => {
    mockRecoverMessageAddress.mockResolvedValue(WALLET);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.referralCode.findFirst.mockResolvedValue({
      id: 1,
      codeHash: CODE_HASH,
      isActive: true,
      createdBy: OTHER_WALLET.toLowerCase(),
      maxClaims: 5,
      expiresAt: null,
      _count: { claimedBy: 2 },
    });
    mockPrisma.user.upsert.mockResolvedValue({});
    mockGrantSponsorshipBudget.mockResolvedValue('0xmocktxhash');

    const res = await request(app).post('/referrals/claim').send({
      walletAddress: WALLET,
      codePlaintext: 'CODE1',
      signature: VALID_SIG,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ allowed: true, sponsorTxHash: '0xmocktxhash' });
    expect(mockPrisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { address: WALLET.toLowerCase() },
        create: expect.objectContaining({ referredByCodeId: 1 }),
        update: expect.objectContaining({ referredByCodeId: 1 }),
      })
    );
  });

  it('returns 200 even when sponsorship grant fails', async () => {
    mockRecoverMessageAddress.mockResolvedValue(WALLET);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.referralCode.findFirst.mockResolvedValue({
      id: 1,
      codeHash: CODE_HASH,
      isActive: true,
      createdBy: OTHER_WALLET.toLowerCase(),
      maxClaims: 5,
      expiresAt: null,
      _count: { claimedBy: 0 },
    });
    mockPrisma.user.upsert.mockResolvedValue({});
    mockGrantSponsorshipBudget.mockRejectedValue(new Error('chain down'));

    const res = await request(app).post('/referrals/claim').send({
      walletAddress: WALLET,
      codePlaintext: 'CODE1',
      signature: VALID_SIG,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ allowed: true });
    expect(res.body.sponsorTxHash).toBeUndefined();
  });
});
