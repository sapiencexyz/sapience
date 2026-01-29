import { Request, Response, Router } from 'express';
import prisma from '../db';
import { hashReferralCode } from '../helpers';

const router = Router();

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

// POST /admin/referrals/codes - create a new admin referral code
router.post('/codes', async (req: Request, res: Response) => {
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

// GET /admin/referrals/codes - list all codes with claim counts
router.get('/codes', async (_req: Request, res: Response) => {
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

// GET /admin/referrals/codes/:id - get single code with claimants
router.get('/codes/:id', async (req: Request, res: Response) => {
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
});

// PUT /admin/referrals/codes/:id - update code settings
router.put('/codes/:id', async (req: Request, res: Response) => {
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
});

// DELETE /admin/referrals/codes/:id - soft-delete (set isActive=false)
router.delete('/codes/:id', async (req: Request, res: Response) => {
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
});

// GET /admin/referrals/codes/:id/analytics - full analytics for a code
router.get('/codes/:id/analytics', async (req: Request, res: Response) => {
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
      userStats.set(addr.toLowerCase(), { volume: BigInt(0), positionCount: 0 });
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
    for (const stats of userStats.values()) {
      totalVolume += stats.volume;
      totalPositions += stats.positionCount;
    }

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
});

export { router };
