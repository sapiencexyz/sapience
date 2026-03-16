import { Request, Response, Router } from 'express';
import prisma from '../db';
import { hashReferralCode } from '../helpers';
import { recoverMessageAddress, type Address } from 'viem';
import { adminAuth } from '../middleware';
import { grantSponsorshipBudget } from '../services/sponsorship';

const router = Router();

const VOLUME_THRESHOLD = 5000;
const DEFAULT_USER_MAX_CLAIMS = 5;

async function calculateVolumeForAddress(address: string): Promise<bigint> {
  const normalizedAddress = address.toLowerCase();

  const positions = await prisma.legacyPosition.findMany({
    where: {
      OR: [
        { predictor: { equals: normalizedAddress, mode: 'insensitive' } },
        { counterparty: { equals: normalizedAddress, mode: 'insensitive' } },
      ],
    },
    select: {
      predictor: true,
      counterparty: true,
      predictorCollateral: true,
      counterpartyCollateral: true,
    },
  });

  let total = BigInt(0);

  for (const position of positions) {
    const predictorIsUser =
      position.predictor.toLowerCase() === normalizedAddress;
    const counterpartyIsUser =
      position.counterparty.toLowerCase() === normalizedAddress;

    if (predictorIsUser && position.predictorCollateral) {
      try {
        total += BigInt(position.predictorCollateral);
      } catch {
        // Skip invalid values
      }
    }

    if (counterpartyIsUser && position.counterpartyCollateral) {
      try {
        total += BigInt(position.counterpartyCollateral);
      } catch {
        // Skip invalid values
      }
    }
  }

  return total;
}

type SetReferralCodeBody = {
  walletAddress?: string;
  codePlaintext?: string;
  signature?: `0x${string}`;
  chainId?: number;
  nonce?: string;
};

type ClaimReferralBody = {
  walletAddress?: string;
  codePlaintext?: string;
  signature?: `0x${string}`;
  chainId?: number;
  nonce?: string;
};

const MESSAGE_PREFIX = 'Sapience Referral';

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

function buildSignedMessagePayload(params: {
  walletAddress: string;
  codeHash: `0x${string}`;
  chainId?: number;
  nonce?: string;
}): string {
  const { walletAddress, codeHash, chainId, nonce } = params;
  return JSON.stringify({
    prefix: MESSAGE_PREFIX,
    walletAddress: normalizeAddress(walletAddress),
    codeHash,
    chainId: chainId ?? null,
    nonce: nonce ?? null,
  });
}

async function verifyWalletSignature(params: {
  walletAddress: string;
  codeHash: `0x${string}`;
  signature: `0x${string}`;
  chainId?: number;
  nonce?: string;
}): Promise<boolean> {
  const { walletAddress, signature, chainId, nonce, codeHash } = params;
  const message = buildSignedMessagePayload({
    walletAddress,
    codeHash,
    chainId,
    nonce,
  });

  const recovered = await recoverMessageAddress({ message, signature });

  return normalizeAddress(recovered) === normalizeAddress(walletAddress);
}

// =============================================================================
// Public Routes
// =============================================================================

// POST /referrals/code - User creates their own referral code
// Requires sufficient trading volume
router.post('/code', async (req: Request, res: Response) => {
  const { walletAddress, codePlaintext, signature, chainId, nonce } =
    req.body as SetReferralCodeBody;

  if (!walletAddress || !codePlaintext || !signature) {
    return res.status(400).json({
      message: 'walletAddress, codePlaintext, and signature are required',
    });
  }

  let codeHash: `0x${string}`;
  try {
    codeHash = hashReferralCode(codePlaintext);
  } catch {
    return res.status(400).json({ message: 'Invalid referral code' });
  }

  try {
    const validSignature = await verifyWalletSignature({
      walletAddress,
      codeHash,
      signature,
      chainId,
      nonce,
    });

    if (!validSignature) {
      return res.status(401).json({ message: 'Invalid signature' });
    }
  } catch (e) {
    console.error('Error verifying referral code signature', e);
    return res.status(400).json({ message: 'Failed to verify signature' });
  }

  // Check if user has enough trading volume
  try {
    const volumeWei = await calculateVolumeForAddress(walletAddress);
    const thresholdWei = BigInt(VOLUME_THRESHOLD) * BigInt(10 ** 18);

    if (volumeWei < thresholdWei) {
      return res.status(403).json({
        message: `Insufficient trading volume.`,
      });
    }
  } catch (e) {
    console.error('Error checking trading volume', e);
    return res.status(500).json({ message: 'Failed to verify trading volume' });
  }

  try {
    // Check if this hash is already taken by someone else
    const existingCodeWithHash = await prisma.referralCode.findFirst({
      where: { codeHash },
    });

    if (existingCodeWithHash) {
      // If user already owns this exact code, return success (idempotent)
      if (
        normalizeAddress(existingCodeWithHash.createdBy) ===
        normalizeAddress(walletAddress)
      ) {
        return res.status(200).json({
          codeHash: existingCodeWithHash.codeHash,
          maxClaims: existingCodeWithHash.maxClaims,
          creatorType: existingCodeWithHash.creatorType,
        });
      }
      // Hash taken by someone else
      return res.status(400).json({
        message: 'Unable to set referral code. Please choose a different code.',
      });
    }

    // Check if user already has a code (to update hash instead of creating new)
    const existingUserCode = await prisma.referralCode.findFirst({
      where: {
        createdBy: normalizeAddress(walletAddress),
        creatorType: 'user',
      },
    });

    if (existingUserCode) {
      // Update hash on existing record (preserves claimants and claim count)
      const updatedCode = await prisma.referralCode.update({
        where: { id: existingUserCode.id },
        data: { codeHash },
      });

      return res.status(200).json({
        codeHash: updatedCode.codeHash,
        maxClaims: updatedCode.maxClaims,
        creatorType: updatedCode.creatorType,
      });
    }

    // No existing code - create new
    const newCode = await prisma.referralCode.create({
      data: {
        codeHash,
        createdBy: normalizeAddress(walletAddress),
        creatorType: 'user',
        maxClaims: DEFAULT_USER_MAX_CLAIMS,
        isActive: true,
      },
    });

    return res.status(200).json({
      codeHash: newCode.codeHash,
      maxClaims: newCode.maxClaims,
      creatorType: newCode.creatorType,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    if (
      message.includes('Unique constraint failed') ||
      message.includes('Unique constraint')
    ) {
      return res.status(400).json({
        message: 'Unable to set referral code. Please choose a different code.',
      });
    }
    console.error('Error setting referral code:', e);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// POST /referrals/claim - Claim a referral code (unified: works for both admin and user codes)
router.post('/claim', async (req: Request, res: Response) => {
  const { walletAddress, codePlaintext, signature, chainId, nonce } =
    req.body as ClaimReferralBody;

  if (!walletAddress || !codePlaintext || !signature) {
    return res.status(400).json({
      message: 'walletAddress, codePlaintext, and signature are required',
    });
  }

  let codeHash: `0x${string}`;
  try {
    codeHash = hashReferralCode(codePlaintext);
  } catch {
    return res.status(400).json({ message: 'Invalid referral code' });
  }

  try {
    const validSignature = await verifyWalletSignature({
      walletAddress,
      codeHash,
      signature,
      chainId,
      nonce,
    });

    if (!validSignature) {
      return res.status(401).json({
        message:
          'Wallet signature could not be verified. Please reconnect your wallet and try again.',
      });
    }
  } catch (e) {
    console.error('Error verifying referral claim signature', e);
    return res.status(400).json({
      message:
        'Signature verification failed. Your wallet may not support this signing method.',
    });
  }

  try {
    // Check if user already has a referral
    const existingUser = await prisma.user.findUnique({
      where: { address: normalizeAddress(walletAddress) },
    });

    if (existingUser?.referredByCodeId) {
      // Check if this is the same code (idempotent)
      const existingCode = await prisma.referralCode.findFirst({
        where: { codeHash },
      });

      if (existingCode && existingUser.referredByCodeId === existingCode.id) {
        // Already claimed this code
        return res.status(200).json({
          allowed: true,
          codeId: existingCode.id,
          creatorType: existingCode.creatorType,
        });
      }

      return res.status(409).json({
        message: 'You have already claimed a different referral code.',
      });
    }

    // Find the code in unified ReferralCode table
    const code = await prisma.referralCode.findFirst({
      where: { codeHash },
      include: { _count: { select: { claimedBy: true } } },
    });

    if (!code) {
      return res.status(404).json({
        message: 'Invite code not found. Please check and try again.',
      });
    }

    // Validate: isActive, not expired, under capacity
    if (!code.isActive) {
      return res
        .status(403)
        .json({ message: 'This invite code has been deactivated.' });
    }

    if (code.expiresAt && code.expiresAt < Math.floor(Date.now() / 1000)) {
      return res.status(403).json({ message: 'This invite code has expired.' });
    }

    if (code._count.claimedBy >= code.maxClaims) {
      return res.status(403).json({
        message:
          'This invite code has reached its claim limit. Please request a new code.',
      });
    }

    // Prevent self-referral
    if (normalizeAddress(code.createdBy) === normalizeAddress(walletAddress)) {
      return res
        .status(400)
        .json({ message: 'You cannot claim your own invite code.' });
    }

    // Create/update user with referredByCodeId
    await prisma.user.upsert({
      where: { address: normalizeAddress(walletAddress) },
      create: {
        address: normalizeAddress(walletAddress),
        referredByCodeId: code.id,
      },
      update: { referredByCodeId: code.id },
    });

    // Grant sponsorship budget on-chain (awaits tx submission, confirmation is fire-and-forget)
    const sponsorTxHash = await grantSponsorshipBudget(
      normalizeAddress(walletAddress) as Address
    ).catch((err) => {
      console.error(
        '[referrals] sponsorship grant failed (non-blocking):',
        err
      );
      return null;
    });

    return res.status(200).json({
      allowed: true,
      ...(sponsorTxHash ? { sponsorTxHash } : {}),
    });
  } catch (e) {
    console.error('Error claiming referral code:', e);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// =============================================================================
// Admin Routes (protected by adminAuth middleware)
// =============================================================================

// POST /referrals/admin/codes - create a new admin referral code
router.post('/admin/codes', adminAuth, async (req: Request, res: Response) => {
  try {
    const { code, maxClaims, expiresAt, createdBy } = req.body as {
      code?: string;
      maxClaims?: number;
      expiresAt?: number;
      createdBy?: string;
    };

    if (!code || !createdBy) {
      return res.status(400).json({
        message: 'code and createdBy are required',
      });
    }

    // Compute hash from plaintext code
    let codeHash: `0x${string}`;
    try {
      codeHash = hashReferralCode(code);
    } catch {
      return res.status(400).json({ message: 'Invalid referral code' });
    }

    // Check if the code already exists
    const existingCode = await prisma.referralCode.findFirst({
      where: { codeHash },
    });

    if (existingCode) {
      return res.status(409).json({
        message: 'Code already exists',
      });
    }

    const referralCode = await prisma.referralCode.create({
      data: {
        codeHash,
        maxClaims: maxClaims ?? 1,
        expiresAt: expiresAt ?? null,
        createdBy: normalizeAddress(createdBy),
        creatorType: 'admin',
      },
    });

    return res.status(201).json({
      id: referralCode.id,
      codeHash: referralCode.codeHash,
      maxClaims: referralCode.maxClaims,
      isActive: referralCode.isActive,
      expiresAt: referralCode.expiresAt,
      createdBy: referralCode.createdBy,
      creatorType: referralCode.creatorType,
      createdAt: referralCode.createdAt,
      claimCount: 0,
    });
  } catch (e) {
    console.error('Error creating referral code:', e);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// GET /referrals/admin/codes - list all codes with claim counts
router.get('/admin/codes', adminAuth, async (_req: Request, res: Response) => {
  try {
    const codes = await prisma.referralCode.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { claimedBy: true },
        },
      },
    });

    return res.status(200).json(
      codes.map((c) => ({
        id: c.id,
        codeHash: c.codeHash,
        maxClaims: c.maxClaims,
        isActive: c.isActive,
        expiresAt: c.expiresAt,
        createdBy: c.createdBy,
        creatorType: c.creatorType,
        createdAt: c.createdAt,
        claimCount: c._count.claimedBy,
      }))
    );
  } catch (e) {
    console.error('Error listing referral codes:', e);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// GET /referrals/admin/codes/:id - get single code with claimants
router.get(
  '/admin/codes/:id',
  adminAuth,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        return res.status(400).json({ message: 'Invalid id' });
      }

      const code = await prisma.referralCode.findUnique({
        where: { id },
        include: {
          claimedBy: {
            select: {
              id: true,
              address: true,
              createdAt: true,
            },
          },
        },
      });

      if (!code) {
        return res.status(404).json({ message: 'Referral code not found' });
      }

      return res.status(200).json({
        id: code.id,
        codeHash: code.codeHash,
        maxClaims: code.maxClaims,
        isActive: code.isActive,
        expiresAt: code.expiresAt,
        createdBy: code.createdBy,
        creatorType: code.creatorType,
        createdAt: code.createdAt,
        claimCount: code.claimedBy.length,
        claimants: code.claimedBy.map((u) => ({
          id: u.id,
          address: u.address,
          claimedAt: u.createdAt,
        })),
      });
    } catch (e) {
      console.error('Error fetching referral code:', e);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  }
);

// PUT /referrals/admin/codes/:id - update code settings
router.put(
  '/admin/codes/:id',
  adminAuth,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        return res.status(400).json({ message: 'Invalid id' });
      }

      const existing = await prisma.referralCode.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ message: 'Referral code not found' });
      }

      const { maxClaims, isActive, expiresAt } = req.body as {
        maxClaims?: number;
        isActive?: boolean;
        expiresAt?: number | null;
      };

      const updatedCode = await prisma.referralCode.update({
        where: { id },
        data: {
          ...(typeof maxClaims !== 'undefined' ? { maxClaims } : {}),
          ...(typeof isActive !== 'undefined' ? { isActive } : {}),
          ...(typeof expiresAt !== 'undefined' ? { expiresAt } : {}),
        },
        include: {
          _count: {
            select: { claimedBy: true },
          },
        },
      });

      return res.status(200).json({
        id: updatedCode.id,
        codeHash: updatedCode.codeHash,
        maxClaims: updatedCode.maxClaims,
        isActive: updatedCode.isActive,
        expiresAt: updatedCode.expiresAt,
        createdBy: updatedCode.createdBy,
        creatorType: updatedCode.creatorType,
        createdAt: updatedCode.createdAt,
        claimCount: updatedCode._count.claimedBy,
      });
    } catch (e) {
      console.error('Error updating referral code:', e);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  }
);

// DELETE /referrals/admin/codes/:id - soft-delete (set isActive=false)
router.delete(
  '/admin/codes/:id',
  adminAuth,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        return res.status(400).json({ message: 'Invalid id' });
      }

      const existing = await prisma.referralCode.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ message: 'Referral code not found' });
      }

      await prisma.referralCode.update({
        where: { id },
        data: { isActive: false },
      });

      return res.status(200).json({ message: 'Referral code deactivated' });
    } catch (e) {
      console.error('Error deleting referral code:', e);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  }
);

// GET /referrals/admin/codes/:id/analytics - full analytics for a code
router.get(
  '/admin/codes/:id/analytics',
  adminAuth,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        return res.status(400).json({ message: 'Invalid id' });
      }

      const code = await prisma.referralCode.findUnique({
        where: { id },
        include: {
          claimedBy: {
            select: {
              address: true,
            },
          },
        },
      });

      if (!code) {
        return res.status(404).json({ message: 'Referral code not found' });
      }

      const userAddresses = code.claimedBy.map((u) => u.address);

      if (userAddresses.length === 0) {
        return res.status(200).json({
          codeHash: code.codeHash,
          claimCount: 0,
          claimants: [],
          totalVolume: '0',
          totalPositions: 0,
        });
      }

      // Get all positions for these users
      const positions = await prisma.legacyPosition.findMany({
        where: {
          OR: [
            { predictor: { in: userAddresses, mode: 'insensitive' } },
            { counterparty: { in: userAddresses, mode: 'insensitive' } },
          ],
        },
        select: {
          predictor: true,
          counterparty: true,
          predictorCollateral: true,
          counterpartyCollateral: true,
        },
      });

      // Calculate per-user trading volume and position count
      const userStats = new Map<
        string,
        { volume: bigint; positionCount: number }
      >();

      for (const addr of userAddresses) {
        userStats.set(addr.toLowerCase(), {
          volume: BigInt(0),
          positionCount: 0,
        });
      }

      for (const position of positions) {
        const predictorLower = position.predictor.toLowerCase();
        const counterpartyLower = position.counterparty.toLowerCase();

        // Count position for predictor if they're in our user set
        if (userStats.has(predictorLower)) {
          const stats = userStats.get(predictorLower)!;
          stats.positionCount += 1;
          if (position.predictorCollateral) {
            try {
              stats.volume += BigInt(position.predictorCollateral);
            } catch {
              // Skip invalid values
            }
          }
        }

        // Count position for counterparty if they're in our user set
        if (userStats.has(counterpartyLower)) {
          const stats = userStats.get(counterpartyLower)!;
          stats.positionCount += 1;
          if (position.counterpartyCollateral) {
            try {
              stats.volume += BigInt(position.counterpartyCollateral);
            } catch {
              // Skip invalid values
            }
          }
        }
      }

      // Build claimants array with stats
      const claimants = userAddresses.map((addr) => {
        const stats = userStats.get(addr.toLowerCase()) || {
          volume: BigInt(0),
          positionCount: 0,
        };
        return {
          address: addr,
          tradingVolume: stats.volume.toString(),
          positionCount: stats.positionCount,
        };
      });

      // Calculate totals
      let totalVolume = BigInt(0);
      let totalPositions = 0;
      userStats.forEach((stats) => {
        totalVolume += stats.volume;
        totalPositions += stats.positionCount;
      });

      return res.status(200).json({
        codeHash: code.codeHash,
        claimCount: code.claimedBy.length,
        claimants,
        totalVolume: totalVolume.toString(),
        totalPositions,
      });
    } catch (e) {
      console.error('Error fetching referral code analytics:', e);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  }
);

export { router };
