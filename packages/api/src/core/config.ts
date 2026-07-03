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
  INTERNAL_RATE_LIMIT_BYPASS_TOKEN: str({
    default: '',
    desc: 'Shared secret that exempts internal services from the per-IP rate limit when sent as the x-internal-token header. Empty (default) disables the bypass entirely.',
  }),
  GRAPHQL_MAX_COMPLEXITY: num({
    default: 15000,
    desc: 'Maximum allowed query complexity score',
  }),
  GRAPHQL_V2_MAX_COMPLEXITY: num({
    default: 10000,
    desc: 'Maximum allowed query complexity score for /v2/graphql. Tighter than v1 because v2 surfaces are flatter and deeply-nested fan-outs are not a legitimate v2 access pattern.',
  }),
  GRAPHQL_V2_MAX_DEPTH: num({
    default: 10,
    desc: "Maximum selection-set depth for /v2/graphql. Relay connections cost two extra levels (edges -> node) over v1's flat lists, and legitimate v2 queries reach through that into pickConfig -> picks -> condition -> category (e.g. the activity feed, positions, forecasts), so the floor is ~8. 10 leaves headroom; query complexity (GRAPHQL_V2_MAX_COMPLEXITY) remains the primary fan-out guard.",
  }),
  GRAPHQL_V2_APQ_TTL_MS: num({
    default: 24 * 60 * 60 * 1000,
    desc: 'TTL (ms) for entries in the v2 Automatic Persisted Queries cache. After this window an unrecognized hash forces clients to resend the full query. Setting too low defeats the purpose of APQ; setting too high lets unused queries linger in memory.',
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
  PRISMA_QUERY_PLAN_CACHE_MAX_SIZE: num({
    default: 128,
    desc: 'Max entries in Prisma 7 query-plan cache (0 disables). Unbounded growth here retains compiled SQL metadata and shows up as prisma__type / {type,chunk} objects in heap snapshots under keeper cron traffic.',
  }),
  FIXTURE_SEED_TIMEOUT_MS: num({
    default: 25000,
    desc: 'Hard ceiling on how long boot-time fixture seeding may delay binding the HTTP port. Exceeding it is non-fatal — the port binds and seeding continues in the background.',
  }),
  DATABASE_URL: str({
    desc: 'Postgres connection string',
  }),
  CONNECTION_POOL_SIZE: num({
    default: 60,
    desc: 'Max Prisma connection pool size. Sized to exceed GRAPHQL_MAX_CONCURRENT_OPERATIONS so admitted requests do not queue at the driver while holding global slots.',
  }),
  GRAPHQL_MAX_CONCURRENT_OPERATIONS: num({
    default: 50,
    desc: 'Max concurrent GraphQL operations before rejecting with 429',
  }),
  GRAPHQL_MAX_CONCURRENT_PER_IP: num({
    default: 25,
    desc: 'Max concurrent GraphQL operations per IP before rejecting with 429',
  }),
  GRAPHQL_INFLIGHT_DUMP_INTERVAL_MS: num({
    default: 0,
    desc: 'Periodic gql_inflight gauge dump interval in ms (0 = disabled). Set to ~60000 in prod or ~5000 during benchmarking.',
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
