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
    choices: ['development', 'staging', 'production', 'test'],
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
    default: 15,
    desc: 'Max concurrent GraphQL operations before shedding load with 503',
  }),
  // x402 payment integration
  X402_PAY_TO: str({
    default: '',
    desc: 'EVM address to receive USDC payments via x402',
  }),
  X402_FACILITATOR_PRIVATE_KEY: str({
    default: '',
    desc: 'Private key for facilitator wallet (settles payments on-chain)',
  }),
  X402_ARBITRUM_RPC_URL: str({
    default: 'https://arb1.arbitrum.io/rpc',
    desc: 'Arbitrum One RPC URL',
  }),
  // Tiered rate limiting (x402 payment tiers)
  FREE_TIER_RATE_LIMIT: num({
    default: 200,
    desc: 'Free tier rate limit (requests per minute before payment required)',
  }),
  HARD_RATE_LIMIT: num({
    default: 400,
    desc: 'Hard rate limit (max requests per minute even with payment)',
  }),
});
