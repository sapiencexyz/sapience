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
  DEFAULT_VAULT_MANAGER: str({ default: '' }), // Fallback manager address if vault contract not deployed
});

export const isProd = config.NODE_ENV === 'production';
export const isDev = config.NODE_ENV === 'development';
