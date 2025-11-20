import { Request, Response, Router } from 'express';
import prisma from '../db';
import { hashReferralCode } from '../helpers';
import { recoverMessageAddress } from 'viem';

const router = Router();

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
        // Rely on Prisma default of 0; callers cannot set this via the API.
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
    const referrer = await prisma.user.findFirst({
      where: { refCodeHash: codeHash },
    });

    if (!referrer) {
      return res.status(404).json({ message: 'Invalid referral code' });
    }

    const max = referrer.maxReferrals ?? 0;

    // Load existing referee (if any) and current referrals for this referrer.
    const existingReferee = await prisma.user.findUnique({
      where: { address: normalizeAddress(walletAddress) },
    });

    const referrals = await prisma.user.findMany({
      where: { referredById: referrer.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    // If the user is already referred by *this* referrer, just report their
    // existing position relative to this referrer.
    if (existingReferee && existingReferee.referredById === referrer.id) {
      const index = referrals.findIndex((u) => u.id === existingReferee.id);
      const position = index === -1 ? null : index + 1;
      // Once a user is referred by this referrer, they remain allowed even if
      // maxReferrals is later reduced. This endpoint is also used to query
      // their current position, so we always treat an existing relationship
      // as allowed.
      const allowed = position !== null;

      return res.status(200).json({
        allowed,
        index: position,
        maxReferrals: max,
      });
    }

    // If the user already has a different referrer, do not allow switching
    // referral codes.
    if (
      existingReferee &&
      existingReferee.referredById &&
      existingReferee.referredById !== referrer.id
    ) {
      return res.status(409).json({
        allowed: false,
        index: null,
        maxReferrals: max,
        message: 'Referral already set for this wallet address.',
      });
    }

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

    // Capacity available: create or update the user to point at this referrer,
    // overwriting any previous referrer relationship.
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
    });
  } catch (e) {
    console.error('Error claiming referral code:', e);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

export { router };
