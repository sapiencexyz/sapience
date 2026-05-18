import { Request, Response, Router } from 'express';
import prisma from '../core/db';
import { hashReferralCode } from '../services';
import { recoverMessageAddress, type Address } from 'viem';
import { adminAuth } from '../runtime/middleware';
import { grantSponsorshipBudget } from '../services/sponsorship';
import { createLogger } from '../core/logger';

const log = createLogger('routes.referrals');

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
    log.error({ err: e }, 'Error verifying referral code signature');
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
    log.error({ err: e }, 'Error checking trading volume');
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
    log.error({ err: e }, 'Error setting referral code:');
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
    log.error({ err: e }, 'Error verifying referral claim signature');
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
      log.error(
        { err: err },
        '[referrals] sponsorship grant failed (non-blocking):'
      );
      return null;
    });

    return res.status(200).json({
      allowed: true,
      ...(sponsorTxHash ? { sponsorTxHash } : {}),
    });
  } catch (e) {
    log.error({ err: e }, 'Error claiming referral code:');
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// GET /referrals/codes - public listing of referral codes with aggregate
// analytics (claim count, total volume, total position count). The admin tools
// in `packages/app` are the only consumer; reads are public because referral
// codes are attribution hints, not authorization credentials. Mutations remain
// admin-signed below.
//
// We cap at MAX_CODES_PER_RESPONSE rows in a single response so a runaway
// table can't return an unbounded payload. The admin UI does not paginate.
const MAX_CODES_PER_RESPONSE = 10_000;
const MAX_CLAIMANTS_PER_RESPONSE = 10_000;

type CodeStats = {
  claimCount: number;
  totalVolume: string;
  totalPositions: number;
};

type CodeStatsRow = {
  id: number;
  claim_count: bigint | number;
  total_volume: string | null;
  total_positions: bigint | number;
};

async function fetchCodeStats(ids: number[]): Promise<Map<number, CodeStats>> {
  const result = new Map<number, CodeStats>();
  if (ids.length === 0) return result;

  const rows = await prisma.$queryRaw<CodeStatsRow[]>`
    WITH claimants AS (
      SELECT id, address, "referredByCodeId"
      FROM app_user
      WHERE "referredByCodeId" = ANY(${ids}::int[])
    ),
    sides AS (
      SELECT c."referredByCodeId" AS code_id,
             CAST(COALESCE(p."predictorCollateral", '0') AS NUMERIC) AS vol
      FROM claimants c
      JOIN "position" p ON LOWER(p."predictor") = LOWER(c.address)
      UNION ALL
      SELECT c."referredByCodeId" AS code_id,
             CAST(COALESCE(p."counterpartyCollateral", '0') AS NUMERIC) AS vol
      FROM claimants c
      JOIN "position" p ON LOWER(p."counterparty") = LOWER(c.address)
    )
    SELECT
      ids.id::INT AS id,
      COALESCE((SELECT COUNT(*) FROM claimants c2 WHERE c2."referredByCodeId" = ids.id), 0)::BIGINT AS claim_count,
      COALESCE(SUM(s.vol), 0)::TEXT AS total_volume,
      COUNT(s.vol)::BIGINT AS total_positions
    FROM unnest(${ids}::int[]) AS ids(id)
    LEFT JOIN sides s ON s.code_id = ids.id
    GROUP BY ids.id
  `;

  for (const row of rows) {
    result.set(row.id, {
      claimCount: Number(row.claim_count ?? 0),
      totalVolume: row.total_volume ?? '0',
      totalPositions: Number(row.total_positions ?? 0),
    });
  }
  return result;
}

type ClaimantBreakdownRow = {
  address: string;
  volume: string | null;
  positions: bigint | number;
};

type Claimant = {
  address: string;
  tradingVolume: string;
  positionCount: number;
};

async function fetchClaimants(
  codeId: number,
  limit: number
): Promise<Claimant[]> {
  const rows = await prisma.$queryRaw<ClaimantBreakdownRow[]>`
    WITH page AS (
      SELECT id, address
      FROM app_user
      WHERE "referredByCodeId" = ${codeId}
      ORDER BY id ASC
      LIMIT ${limit}
    ),
    sides AS (
      SELECT p2.id AS user_id,
             CAST(COALESCE(pos."predictorCollateral", '0') AS NUMERIC) AS vol
      FROM page p2
      JOIN "position" pos ON LOWER(pos."predictor") = LOWER(p2.address)
      UNION ALL
      SELECT p2.id AS user_id,
             CAST(COALESCE(pos."counterpartyCollateral", '0') AS NUMERIC) AS vol
      FROM page p2
      JOIN "position" pos ON LOWER(pos."counterparty") = LOWER(p2.address)
    )
    SELECT
      page.address AS address,
      COALESCE(SUM(s.vol), 0)::TEXT AS volume,
      COUNT(s.vol)::BIGINT AS positions
    FROM page
    LEFT JOIN sides s ON s.user_id = page.id
    GROUP BY page.id, page.address
    ORDER BY page.id ASC
  `;

  return rows.map((r) => ({
    address: r.address,
    tradingVolume: r.volume ?? '0',
    positionCount: Number(r.positions ?? 0),
  }));
}

router.get('/codes', async (_req: Request, res: Response) => {
  try {
    const codes = await prisma.referralCode.findMany({
      orderBy: { id: 'desc' },
      take: MAX_CODES_PER_RESPONSE,
    });
    const statsMap = await fetchCodeStats(codes.map((c) => c.id));
    const items = codes.map((c) => {
      const stats = statsMap.get(c.id) ?? {
        claimCount: 0,
        totalVolume: '0',
        totalPositions: 0,
      };
      return {
        id: c.id,
        maxClaims: c.maxClaims,
        isActive: c.isActive,
        expiresAt: c.expiresAt,
        createdBy: c.createdBy,
        creatorType: c.creatorType,
        createdAt: c.createdAt,
        ...stats,
      };
    });
    return res.status(200).json({ items });
  } catch (e) {
    log.error({ err: e }, 'Error listing referral codes');
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// GET /referrals/codes/:id - analytics for one code with the full claimant
// breakdown. Combined into a single response so the admin analytics dialog
// is one fetch.
router.get('/codes/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ message: 'Invalid id' });
  }
  try {
    const code = await prisma.referralCode.findUnique({ where: { id } });
    if (!code) {
      return res.status(404).json({ message: 'Referral code not found' });
    }
    const [statsMap, claimants] = await Promise.all([
      fetchCodeStats([id]),
      fetchClaimants(id, MAX_CLAIMANTS_PER_RESPONSE),
    ]);
    const stats = statsMap.get(id) ?? {
      claimCount: 0,
      totalVolume: '0',
      totalPositions: 0,
    };
    return res.status(200).json({ id, ...stats, claimants });
  } catch (e) {
    log.error({ err: e }, 'Error reading referral code analytics');
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
    log.error({ err: e }, 'Error creating referral code:');
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

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
      log.error({ err: e }, 'Error updating referral code:');
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
      log.error({ err: e }, 'Error deleting referral code:');
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  }
);

export { router };
