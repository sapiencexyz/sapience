import dotenv from 'dotenv';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';
import { recoverMessageAddress } from 'viem';

// TODO: Update monorepo structure so that we can import this from packages/app/src/lib/constants/constants.ts
const ADMIN_AUTHENTICATE_MSG =
  'Sign this message to authenticate for admin actions.';

// Load environment variables
dotenv.config({
  path: path.resolve(new URL('.', import.meta.url).pathname, '../.env'),
});
const ALLOWED_ADDRESSES =
  process.env.ALLOWED_ADDRESSES?.split(',').map((a) => a.toLowerCase()) || [];
const MESSAGE_EXPIRY = 5 * 60 * 1000; // 5 minutes in milliseconds

export async function isValidWalletSignature(
  signature: `0x${string}` | undefined,
  timestampSeconds: number | undefined
): Promise<boolean> {
  if (!signature || !timestampSeconds) {
    return false;
  }
  // Check if signature is expired
  const nowMs = Date.now();
  const timestampMs = timestampSeconds * 1000; // Convert timestamp from seconds to milliseconds
  // Reject far-future timestamps and expired ones
  if (timestampMs > nowMs || nowMs - timestampMs > MESSAGE_EXPIRY) {
    return false;
  }

  try {
    // Bind the signature to the timestamp to prevent replay
    const messageToVerify = `${ADMIN_AUTHENTICATE_MSG}:${timestampSeconds}`;
    const recoveredAddress = await recoverMessageAddress({
      message: messageToVerify,
      signature,
    });

    // Check if recovered address is allowed
    const isAllowed = ALLOWED_ADDRESSES.includes(
      recoveredAddress.toLowerCase()
    );
    if (!isAllowed) {
      console.warn(
        `Admin auth failed: address ${recoveredAddress} not in allowlist`
      );
    }

    return isAllowed;
  } catch (error) {
    console.error('Error recovering address for admin auth', error);
    return false;
  }
}

export async function adminAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const isProductionOrStaging =
    process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';

  // In local development, skip admin auth checks
  if (!isProductionOrStaging) {
    return next();
  }

  const signature = (req.headers['x-admin-signature'] || '') as `0x${string}`;
  const timestampHeader = req.headers['x-admin-signature-timestamp'];
  const timestampSeconds = Number(
    Array.isArray(timestampHeader) ? timestampHeader[0] : timestampHeader
  );

  if (!signature || !timestampSeconds || !Number.isFinite(timestampSeconds)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const ok = await isValidWalletSignature(signature, timestampSeconds);
  if (!ok) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  return next();
}
