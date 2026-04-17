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

const cleaned = cleanEnv(process.env, {
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
  MAX_BIDS_PER_ESCROW_AUCTION: num({ default: 50 }), // Max bids per escrow auction (matches secondary market)
  DEFAULT_VAULT_MANAGER: str({ default: '' }), // Fallback manager address if vault contract not deployed
  // ── Committed Intent (PRD-001) — all paths gated on COMMITTED_INTENT_ENABLED ──
  COMMITTED_INTENT_ENABLED: bool({ default: false }),
  /** Leverage factor `k` in bps — relayer-side only; O-3 default = 1x (10000 bps). */
  COMMITTED_INTENT_LEVERAGE_FACTOR_BPS: num({ default: 10_000 }),
  /** Min insurance rate — O-4 default = 10% (1000 bps). */
  COMMITTED_INTENT_MIN_INSURANCE_RATE_BPS: num({ default: 1_000 }),
  /** Max deadline for sponsored commitments (§4.3.2) — default 60s. */
  COMMITTED_INTENT_MAX_SPONSORED_DEADLINE_SECONDS: num({ default: 60 }),
  /** Min `amountIn` for sponsored commitments (§4.3.2) — default 1 WUSDe (1e18). */
  COMMITTED_INTENT_MIN_SPONSORED_AMOUNT_IN: str({
    default: '1000000000000000000',
  }),
  /** Grace seconds after deadline before pruning an expired commitment from the registry. */
  COMMITTED_INTENT_GRACE_SECONDS: num({ default: 60 }),
});

export const config = {
  ...cleaned,
  /**
   * Min `amountIn` for sponsored commitments, parsed as bigint.
   * Uses decimal-string env var so bigints can exceed safe-int range.
   */
  COMMITTED_INTENT_MIN_SPONSORED_AMOUNT_IN: (() => {
    try {
      return BigInt(cleaned.COMMITTED_INTENT_MIN_SPONSORED_AMOUNT_IN);
    } catch {
      return 10n ** 18n;
    }
  })(),
};

export const isProd = config.NODE_ENV === 'production';
export const isDev = config.NODE_ENV === 'development';
