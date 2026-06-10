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

export const env = cleanEnv(process.env, {
  PORT: num({ default: 3200 }),
  /** 0x-prefixed 32-byte hex. The per-pool fairness secret: cards are dealt
   *  as keccak(secret, poolId, player); keccak(secret) is published when the
   *  pool opens and the secret itself is revealed after the cutoff. Rotate it
   *  with every new pool. */
  SERVER_SECRET: hex32(),
  /** Static bearer token for /admin/* endpoints (scripts/curl). The admin
   *  UI signs in with SIWE instead — see ADMIN_ADDRESS. */
  ADMIN_TOKEN: nonEmpty(),
  /** Wallet allowed to SIWE-login as admin. Empty = resolve on-chain as the
   *  receipt contract's owner() (the treasury that pays bonuses). */
  ADMIN_ADDRESS: str({ default: '' }),
  POOL_PATH: str({ default: 'pool.json' }),
  DATA_DIR: str({ default: 'data' }),
  RELAYER_WS_URL: str({
    default: 'wss://relayer.staging.sapience.xyz/auction',
  }),
  /** Built Vite frontend to serve at / (SPA fallback). The dir not existing
   *  is fine in dev — run the Vite dev server instead, it proxies /api. */
  STATIC_DIR: str({ default: '../bingo/dist' }),
  ZERODEV_PROJECT_ID: str({
    default: '88765cdf-f8a9-4b80-92e5-60ef51c94751',
  }),
  /** BingoCardReceipt NFT. Both empty = receipt minting disabled. */
  RECEIPT_CONTRACT_ADDRESS: str({ default: '' }),
  /** Hot wallet authorized as the receipt contract's minter. */
  MINTER_PRIVATE_KEY: str({ default: '' }),
});
