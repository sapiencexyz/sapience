import { cleanEnv, str, bool, num } from 'envalid';
import { config as dotEnvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function fromRoot(relativePath: string): string {
  // Go up from packages/auction/src to repo root
  const repoRoot = resolve(__dirname, '../../..');
  return resolve(repoRoot, relativePath);
}

dotEnvConfig({ path: fromRoot('.env') });

export const config = cleanEnv(process.env, {
  NODE_ENV: str({
    choices: ['development', 'production', 'test'],
    default: 'development',
  }),
  PORT: str({ default: '3002' }),
  ENABLE_AUCTION_WS: bool({ default: true }),
  SENTRY_DSN: str({ default: '' }),
  RATE_LIMIT_WINDOW_MS: num({ default: 10_000 }),
  RATE_LIMIT_MAX_MESSAGES: num({ default: 100 }),
  WS_IDLE_TIMEOUT_MS: num({ default: 300_000 }), // 5 minutes
  WS_MAX_CONNECTIONS: num({ default: 1000 }),
  WS_ALLOWED_ORIGINS: str({ default: '' }), // Comma-separated list, empty = allow all
  WS_MAX_CONNECTIONS_PER_IP: num({ default: 50 }), // Max connections from a single IP
  WS_MAX_VALIDATION_FAILURES: num({ default: 10 }), // Disconnect after N signature validation failures
  WS_MAX_INVALID_MESSAGES: num({ default: 20 }), // Disconnect after N invalid/malformed messages
  // When true, `auction.started` is delivered only to clients whose identify
  // role is `counterparty` or `both` (predictors/anonymous are skipped). Kept
  // false until vault-bot + app deploy with their declared role; flipping it
  // then cuts the per-auction broadcast fan-out from "every connection" to
  // "actual counterparties only". See AuctionRole in @sapience/sdk/types.
  AUCTION_FEED_ROLE_GATING: bool({ default: false }),
  MAX_BIDS_PER_ESCROW_AUCTION: num({ default: 50 }), // Max bids per escrow auction (matches secondary market)
  MAX_BIDS_PER_CONNECTION_PER_AUCTION: num({ default: 5 }), // Per-connection cap so one connection can't monopolize an auction's bid slots with unverifiable bids

  DEFAULT_VAULT_MANAGER: str({ default: '' }), // Fallback manager address if vault contract not deployed
});

export const isProd = config.NODE_ENV === 'production';
export const isDev = config.NODE_ENV === 'development';
