import { Request, Response, Router } from 'express';
import prisma from '../db';
import { hashReferralCode } from '../helpers';
import { recoverMessageAddress } from 'viem';
import { adminAuth } from '../middleware';

const router = Router();

const VOLUME_THRESHOLD = 5000;

async function calculateVolumeForAddress(address: string): Promise<bigint> {
  const normalizedAddress = address.toLowerCase();

  const positions = await prisma.position.findMany({
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

  // Check if code already exists as an admin referral code
  try {
    const existingAdminCode = await prisma.referralCode.findFirst({
      where: { codeHash },
    });

    if (existingAdminCode) {
      return res.status(400).json({
        message: 'Unable to set referral code. Please choose a different code.',
      });
    }
  } catch (e) {
    console.error('Error checking admin codes', e);
    return res.status(500).json({ message: 'Internal Server Error' });
  }

  try {
    // Note: maxReferrals is intentionally *not* writable via this public
    // endpoint. It is managed exclusively by admins / internal tooling.
    const updated = await prisma.user.upsert({
      where: { address: normalizeAddress(walletAddress) },
      update: {
        refCodeHash: codeHash,
      },
      create: {
        address: normalizeAddress(walletAddress),
        refCodeHash: codeHash,
        maxReferrals: 5,
      },
    });

    return res.status(200).json({
      address: updated.address,
      refCodeHash: updated.refCodeHash,
      maxReferrals: updated.maxReferrals,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    if (
      message.includes('Unique constraint failed') ||
      message.includes('Unique constraint')
    ) {
      // If another user already has this code hash, treat it as an invalid /
      // unavailable code rather than surfacing a low-level unique constraint.
      return res.status(400).json({
        message: 'Unable to set referral code. Please choose a different code.',
      });
    }
    console.error('Error setting referral code:', e);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

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
      return res.status(401).json({ message: 'Invalid signature' });
    }
  } catch (e) {
    console.error('Error verifying referral claim signature', e);
    return res.status(400).json({ message: 'Failed to verify signature' });
  }

  try {
    // Check if user already has ANY referral (either user code or admin code)
    const existingUser = await prisma.user.findUnique({
      where: { address: normalizeAddress(walletAddress) },
    });

    if (existingUser) {
      // If user already has a user referral, check if it matches current code
      if (existingUser.referredById) {
        // Check if this is the same referrer's code
        const referrer = await prisma.user.findFirst({
          where: { refCodeHash: codeHash },
        });

        if (referrer && existingUser.referredById === referrer.id) {
          // Already referred by this user, return their position
          const referrals = await prisma.user.findMany({
            where: { referredById: referrer.id },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          });
          const index = referrals.findIndex((u) => u.id === existingUser.id);
          const position = index === -1 ? null : index + 1;
          return res.status(200).json({
            allowed: position !== null,
            index: position,
            maxReferrals: referrer.maxReferrals ?? 0,
            type: 'user',
          });
        }

        return res.status(409).json({
          message: 'Already referred by a user',
        });
      }

      // If user already has an admin code referral
      if (existingUser.referredByCodeId) {
        // Check if this is the same admin code
        const adminCode = await prisma.referralCode.findFirst({
          where: { codeHash },
        });

        if (adminCode && existingUser.referredByCodeId === adminCode.id) {
          // Already claimed this admin code
          return res.status(200).json({
            allowed: true,
            type: 'admin',
            codeId: adminCode.id,
          });
        }

        return res.status(409).json({
          message: 'Already claimed a referral code',
        });
      }
    }

    // Check if it's an admin code first
    const adminCode = await prisma.referralCode.findFirst({
      where: { codeHash },
      include: { _count: { select: { claimedBy: true } } },
    });

    if (adminCode) {
      // Validate: isActive, not expired, under capacity
      if (!adminCode.isActive) {
        return res.status(403).json({ message: 'Code is no longer active' });
      }

      if (
        adminCode.expiresAt &&
        adminCode.expiresAt < Math.floor(Date.now() / 1000)
      ) {
        return res.status(403).json({ message: 'Code has expired' });
      }

      if (
        adminCode.maxClaims > 0 &&
        adminCode._count.claimedBy >= adminCode.maxClaims
      ) {
        return res.status(403).json({ message: 'Code has reached claim limit' });
      }

      // Create/update user with referredByCodeId
      await prisma.user.upsert({
        where: { address: normalizeAddress(walletAddress) },
        create: {
          address: normalizeAddress(walletAddress),
          referredByCodeId: adminCode.id,
        },
        update: { referredByCodeId: adminCode.id },
      });

      return res
        .status(200)
        .json({ allowed: true, type: 'admin', codeId: adminCode.id });
    }

    // Fall through to existing user code logic
    const referrer = await prisma.user.findFirst({
      where: { refCodeHash: codeHash },
    });

    if (!referrer) {
      return res.status(404).json({ message: 'Invalid referral code' });
    }

    const max = referrer.maxReferrals ?? 0;

    const referrals = await prisma.user.findMany({
      where: { referredById: referrer.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    // User is either not yet referred or is switching from another referrer
    // to this one. Enforce capacity: if this code is not configured
    // (maxReferrals <= 0) or already full, do not create/update the
    // referral relationship.
    const prospectivePosition = referrals.length + 1;
    if (max <= 0 || prospectivePosition > max) {
      return res.status(403).json({
        allowed: false,
        index: null,
        maxReferrals: max,
      });
    }

    // Capacity available: create or update the user to point at this referrer.
    await prisma.user.upsert({
      where: { address: normalizeAddress(walletAddress) },
      create: {
        address: normalizeAddress(walletAddress),
        referredById: referrer.id,
      },
      update: {
        referredById: referrer.id,
      },
    });

    return res.status(200).json({
      allowed: true,
      index: prospectivePosition,
      maxReferrals: max,
      type: 'user',
    });
  } catch (e) {
    console.error('Error claiming referral code:', e);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});


// POST /referrals/admin/codes - create a new admin referral code
router.post('/admin/codes', adminAuth, async (req: Request, res: Response) => {
  try {
    const { code, description, maxClaims, expiresAt, createdBy } = req.body as {
      code?: string;
      description?: string;
      maxClaims?: number;
      expiresAt?: number;
      createdBy?: string;
    };

    if (!code || !createdBy) {
      return res.status(400).json({
        message: 'code and createdBy are required',
      });
    }

    let codeHash: `0x${string}`;
    try {
      codeHash = hashReferralCode(code);
    } catch {
      return res.status(400).json({ message: 'Invalid referral code' });
    }

    // Check if the code hash already exists in User.refCodeHash (user codes)
    const existingUserCode = await prisma.user.findFirst({
      where: { refCodeHash: codeHash },
    });

    if (existingUserCode) {
      return res.status(409).json({
        message: 'Code already exists as a user referral code',
      });
    }

    // Check if the code already exists in ReferralCode
    const existingAdminCode = await prisma.referralCode.findFirst({
      where: { codeHash },
    });

    if (existingAdminCode) {
      return res.status(409).json({
        message: 'Code already exists',
      });
    }

    const referralCode = await prisma.referralCode.create({
      data: {
        code: code.trim(),
        codeHash,
        description: description ?? null,
        maxClaims: maxClaims ?? 0,
        expiresAt: expiresAt ?? null,
        createdBy: normalizeAddress(createdBy),
      },
      include: {
        _count: {
          select: { claimedBy: true },
        },
      },
    });

    return res.status(201).json({
      id: referralCode.id,
      code: referralCode.code,
      codeHash: referralCode.codeHash,
      description: referralCode.description,
      maxClaims: referralCode.maxClaims,
      isActive: referralCode.isActive,
      expiresAt: referralCode.expiresAt,
      createdBy: referralCode.createdBy,
      createdAt: referralCode.createdAt,
      claimCount: referralCode._count.claimedBy,
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
      codes.map((code) => ({
        id: code.id,
        code: code.code,
        codeHash: code.codeHash,
        description: code.description,
        maxClaims: code.maxClaims,
        isActive: code.isActive,
        expiresAt: code.expiresAt,
        createdBy: code.createdBy,
        createdAt: code.createdAt,
        claimCount: code._count.claimedBy,
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
        code: code.code,
        codeHash: code.codeHash,
        description: code.description,
        maxClaims: code.maxClaims,
        isActive: code.isActive,
        expiresAt: code.expiresAt,
        createdBy: code.createdBy,
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

      const { description, maxClaims, isActive, expiresAt } = req.body as {
        description?: string | null;
        maxClaims?: number;
        isActive?: boolean;
        expiresAt?: number | null;
      };

      const updatedCode = await prisma.referralCode.update({
        where: { id },
        data: {
          ...(typeof description !== 'undefined' ? { description } : {}),
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
        code: updatedCode.code,
        codeHash: updatedCode.codeHash,
        description: updatedCode.description,
        maxClaims: updatedCode.maxClaims,
        isActive: updatedCode.isActive,
        expiresAt: updatedCode.expiresAt,
        createdBy: updatedCode.createdBy,
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
          code: code.code,
          claimCount: 0,
          claimants: [],
          totalVolume: '0',
          totalPositions: 0,
        });
      }

      // Get all positions for these users
      const positions = await prisma.position.findMany({
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
        code: code.code,
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
