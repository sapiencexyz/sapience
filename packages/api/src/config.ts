import { cleanEnv, str, num } from 'envalid';
import { config as dotEnvConfig } from 'dotenv';
import { fromRoot } from './utils/fromRoot';

dotEnvConfig({ path: fromRoot('.env') });

/**
 * Define all API environment variables here. By avoiding direct process.env access elsewhere,
 * we keep configuration centralized and make required variables easy to audit.
 */
export const config = cleanEnv(process.env, {
  NODE_ENV: str({
    choices: ['development', 'production', 'test'],
    default: 'development',
  }),
  RATE_LIMIT_WINDOW_MS: num({
    default: 60000,
    desc: 'Rate limit window in milliseconds',
  }),
  RATE_LIMIT_MAX_REQUESTS: num({
    default: 600,
    desc: 'Maximum requests per window per IP',
  }),
});
