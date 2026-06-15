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

const addressOrEmpty = makeValidator<string>((v) => {
  const t = v.trim();
  if (t && !/^0x[0-9a-fA-F]{40}$/.test(t)) {
    throw new Error('must be a 0x-prefixed 20-byte address (or empty)');
  }
  return t;
});

// Per-network facts (chain, relayer, receipt contract, log-scan floor) are
// NOT env vars — they're hardcoded in network.ts; one deployment serves
// both networks. The env is only secrets + deployment plumbing.
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
  /** Optional STAGING pool file override: one pool object or an array of
   *  pools (last = active). Empty (default) = the committed pool.json. The
   *  main network always uses the committed pool.main.json. */
  POOL_PATH: str({ default: '' }),
  /** Built Vite frontend to serve at / (SPA fallback; node entry only — on
   *  Vercel the platform serves the static build). The dir not existing is
   *  fine in dev — run the Vite dev server instead, it proxies /api. */
  STATIC_DIR: str({ default: 'dist' }),
  /** One project for both networks (enable both chains + gas policies). */
  ZERODEV_PROJECT_ID: str({
    default: '88765cdf-f8a9-4b80-92e5-60ef51c94751',
  }),
  /** Hot wallet whose ZeroDev smart account is the receipt contracts'
   *  minter — the SAME smart-account address on both networks (kernel
   *  accounts are deterministic), so one key serves both. */
  MINTER_PRIVATE_KEY: hex32(),
});
