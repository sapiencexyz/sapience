import { cleanEnv, str, num } from 'envalid';
import { config as dotEnvConfig } from 'dotenv';
import { fromRoot } from '../lib/fromRoot';

const validators = {
  NODE_ENV: str({
    choices: ['development', 'staging', 'production', 'test'] as const,
    default: 'development',
  }),
  RATE_LIMIT_WINDOW_MS: num({
    default: 60000,
    desc: 'Rate limit window in milliseconds',
  }),
  RATE_LIMIT_MAX_REQUESTS: num({
    default: 200,
    desc: 'Maximum requests per window per IP',
  }),
  GRAPHQL_MAX_COMPLEXITY: num({
    default: 15000,
    desc: 'Maximum allowed query complexity score',
  }),
  GRAPHQL_MAX_LIST_SIZE: num({
    default: 100,
    desc: 'Maximum allowed take/first/limit argument value',
  }),
  GRAPHQL_MAX_FIELD_ALIASES: num({
    default: 3,
    desc: 'Maximum times a single field can be aliased in one query',
  }),
  GRAPHQL_REQUEST_TIMEOUT_MS: num({
    default: 15000,
    desc: 'Maximum time for a GraphQL request to complete',
  }),
  PRISMA_QUERY_TIMEOUT_MS: num({
    default: 8000,
    desc: 'Maximum time for a Prisma query to complete',
  }),
  DATABASE_URL: str({
    desc: 'Postgres connection string',
  }),
  CONNECTION_POOL_SIZE: num({
    default: 20,
    desc: 'Max Prisma connection pool size',
  }),
  GRAPHQL_MAX_CONCURRENT_OPERATIONS: num({
    default: 50,
    desc: 'Max concurrent GraphQL operations before rejecting with 429',
  }),
  GRAPHQL_MAX_CONCURRENT_PER_IP: num({
    default: 25,
    desc: 'Max concurrent GraphQL operations per IP before rejecting with 429',
  }),
  LOG_LEVEL: str({
    choices: [
      'trace',
      'debug',
      'info',
      'warn',
      'error',
      'fatal',
      'silent',
    ] as const,
    default:
      process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
        ? 'debug'
        : 'info',
    desc: 'Pino log level (trace|debug|info|warn|error|fatal|silent)',
  }),
};

type Config = Readonly<ReturnType<typeof cleanEnv<typeof validators>>>;

let _config: Config | undefined;

function createConfig(): Config {
  dotEnvConfig({ path: fromRoot('.env') });
  return cleanEnv(process.env, validators);
}

/**
 * Lazily-validated environment config.
 *
 * Env vars are validated on first property access, not at import time.
 * This allows build-time scripts (e.g. emit-schema) to import modules
 * that transitively depend on config without needing real env vars.
 */
export const config: Config = new Proxy({} as Config, {
  get(_, prop) {
    if (!_config) _config = createConfig();
    return Reflect.get(_config, prop);
  },
});
