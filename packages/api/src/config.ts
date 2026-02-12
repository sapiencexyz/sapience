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
    default: 200,
    desc: 'Maximum requests per window per IP',
  }),
  GRAPHQL_MAX_COMPLEXITY: num({
    default: 10000,
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
    default: 10000,
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
    default: 15,
    desc: 'Max concurrent GraphQL operations before shedding load with 503',
  }),
});
