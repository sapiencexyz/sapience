import dotenv from 'dotenv';
import path from 'path';
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
  timestamp: number | undefined
): Promise<boolean> {
  if (!signature || !timestamp) {
    return false;
  }
  // Check if signature is expired
  const now = Date.now();
  if (now - timestamp > MESSAGE_EXPIRY) {
    return false;
  }

  // Recover address from signature
  try {
    const recoveredAddress = await recoverMessageAddress({
      message: ADMIN_AUTHENTICATE_MSG,
      signature,
    });

    // Check if recovered address is allowed
    const isAllowed = ALLOWED_ADDRESSES.includes(
      recoveredAddress.toLowerCase()
    );

    return isAllowed;
  } catch {
    return false;
  }
}
