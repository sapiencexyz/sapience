import 'dotenv/config';
import { cleanEnv, makeValidator, num, str } from 'envalid';

const hex32 = makeValidator<string>((v) => {
  if (!/^0x[0-9a-fA-F]{64}$/.test(v)) {
    throw new Error('must be 0x-prefixed 32-byte hex');
  }
  return v;
});

const nonEmpty = makeValidator<string>((v) => {
  // An empty admin token would make `Bearer ` authenticate anyone.
  if (!v.trim()) throw new Error('must be non-empty');
  return v;
});

const address = makeValidator<string>((v) => {
  // Catch copy-paste artifacts (trailing dots, whitespace) at boot instead
  // of as confusing viem errors at request time.
  const t = v.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(t)) {
    throw new Error('must be a 0x-prefixed 20-byte address');
  }
  return t;
});

const addressOrEmpty = makeValidator<string>((v) => {
  const t = v.trim();
  if (t && !/^0x[0-9a-fA-F]{40}$/.test(t)) {
    throw new Error('must be a 0x-prefixed 20-byte address (or empty)');
  }
  return t;
});

export const env = cleanEnv(process.env, {
  PORT: num({ default: 3200 }),
  /** 0x-prefixed 32-byte hex MASTER fairness secret. Each pool's secret is
   *  derived as keccak(master ‖ poolId); cards are dealt as
   *  keccak(poolSecret, poolId, player). keccak(poolSecret) is published
   *  while the pool is open, the pool secret itself is revealed after the
   *  cutoff. The master secret is never revealed. */
  SERVER_SECRET: hex32(),
  /** Static bearer token for /admin/* endpoints (scripts/curl). The admin
   *  UI signs in with SIWE instead — see ADMIN_ADDRESS. */
  ADMIN_TOKEN: nonEmpty(),
  /** Wallet allowed to SIWE-login as admin. Empty = resolve on-chain as the
   *  receipt contract's owner() (the treasury that pays bonuses). */
  ADMIN_ADDRESS: addressOrEmpty({ default: '' }),
  /** Optional pool config file override: one pool object or an array of
   *  pools (last = active). Empty (default) = use the pool.json committed
   *  next to the code, which is bundled into serverless builds. */
  POOL_PATH: str({ default: '' }),
  RELAYER_WS_URL: str({
    default: 'wss://relayer.staging.sapience.xyz/auction',
  }),
  /** Built Vite frontend to serve at / (SPA fallback; node entry only — on
   *  Vercel the platform serves the static build). The dir not existing is
   *  fine in dev — run the Vite dev server instead, it proxies /api. */
  STATIC_DIR: str({ default: 'dist' }),
  ZERODEV_PROJECT_ID: str({
    default: '88765cdf-f8a9-4b80-92e5-60ef51c94751',
  }),
  /** BingoCardReceipt NFT — REQUIRED: it is the system's database (the
   *  durable record of every submission and the payout rail). */
  RECEIPT_CONTRACT_ADDRESS: address(),
  /** Hot wallet authorized as the receipt contract's minter. */
  MINTER_PRIVATE_KEY: hex32(),
  /** Lower bound for on-chain log scans (receipt + escrow events). Defaults
   *  to the BingoCardReceipt (multi-card) deploy block on Ethereal testnet. */
  LOG_FROM_BLOCK: num({ default: 4828264 }),
});
