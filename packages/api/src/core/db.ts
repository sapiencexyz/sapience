import { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma';
import { config } from './config';
import { createLogger } from './logger';

const log = createLogger('prisma');

export const requestContext = new AsyncLocalStorage<{
  count: number;
  requestId: string;
}>();

/**
 * Async-scoped opt-out of the request-path query timeout.
 *
 * One-time boot/seed queries (fixtures) run before steady-state traffic,
 * and a transient cold-DB slowdown there must NOT abort the operation:
 * the request-path timeout exists to shed load, which is meaningless for
 * seeding. Wrapping a seeding call in `runWithoutQueryTimeout` makes every
 * Prisma query inside it bypass the timeout in `withQueryTimeout` below.
 *
 * This is the root-cause fix for the incident where a boot-time
 * `Category.findFirst` crossed the 8s timeout, aborted startup before the
 * HTTP port bound, and 502'd every request until a manual redeploy.
 */
const queryTimeoutBypass = new AsyncLocalStorage<true>();

export const runWithoutQueryTimeout = <T>(fn: () => Promise<T>): Promise<T> =>
  queryTimeoutBypass.run(true, fn);

/**
 * Race an async operation against a timeout, rejecting with a labelled
 * error if it overruns. Operations run inside `runWithoutQueryTimeout`
 * bypass the timeout entirely.
 *
 * NOTE: the timeout only stops *waiting* — the underlying query keeps
 * running on its connection until Postgres finishes it.
 */
export const withQueryTimeout = async <T>(
  run: () => Promise<T>,
  opts: { label: string; timeoutMs: number }
): Promise<T> => {
  if (queryTimeoutBypass.getStore()) return run();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(`Query timeout: ${opts.label} exceeded ${opts.timeoutMs}ms`)
      );
    }, opts.timeoutMs);
  });

  try {
    return await Promise.race([run(), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

let _instance: PrismaClient | undefined;
let _extendedInstance: PrismaClient | undefined;

/** Deterministic prepared-statement names so pg reuses server-side plans. */
const statementNameGenerator = (query: { sql: string }): string => {
  const hash = createHash('sha256')
    .update(query.sql)
    .digest('hex')
    .slice(0, 16);
  return `p_${hash}`;
};

function getInstance(): PrismaClient {
  if (_instance) return _instance;

  // Bound the connection pool to avoid exhausting DB connections.
  // In Prisma 7 these params come from the adapter (pg connection
  // options), not from query-string params on DATABASE_URL, because
  // the Rust engine that used to parse those is gone.
  const adapter = new PrismaPg(
    {
      connectionString: config.DATABASE_URL,
      max: config.CONNECTION_POOL_SIZE,
      idleTimeoutMillis: 10_000,
    },
    { statementNameGenerator }
  );

  // Generated PrismaClient ctor types can trail the 7.8 runtime by a
  // patch; queryPlanCacheMaxSize is supported at runtime regardless.
  _instance = new PrismaClient({
    adapter,
    // Cap Prisma 7's query-plan cache. Without a bound, keeper cron
    // traffic (many paginated condition/forecast walks) can retain
    // hundreds of thousands of compiled-plan objects in heap.
    queryPlanCacheMaxSize: config.PRISMA_QUERY_PLAN_CACHE_MAX_SIZE,
    log: config.isProd
      ? (['info', 'warn', 'error'] as const)
      : (['warn', 'error'] as const),
    transactionOptions: {
      maxWait: config.PRISMA_QUERY_TIMEOUT_MS,
      timeout: config.PRISMA_QUERY_TIMEOUT_MS,
    },
  } as ConstructorParameters<typeof PrismaClient>[0]);

  // `$use` was removed in Prisma 6.16+; the modern equivalent is
  // `$extends({ query: { $allOperations } })`. We compose the old
  // three middlewares (timing, counter, timeout) into one wrapper.
  _extendedInstance = _instance.$extends({
    query: {
      $allOperations: async ({ model, operation, args, query }) => {
        const store = requestContext.getStore();
        if (store) store.count++;

        const start = performance.now();
        const result = await withQueryTimeout(() => query(args), {
          label: `${model ?? 'raw'}.${operation}`,
          timeoutMs: config.PRISMA_QUERY_TIMEOUT_MS,
        });
        const durationMs = performance.now() - start;
        // Per-query logs at debug level — one Prisma operation per
        // resolver field gets noisy fast in production. Filter with
        // LOG_LEVEL=debug while investigating.
        log.debug(
          {
            model: model ?? 'raw',
            operation,
            durationMs: Number(durationMs.toFixed(1)),
            requestId: store?.requestId || undefined,
          },
          'prisma.query'
        );
        return result;
      },
    },
  }) as unknown as PrismaClient;

  return _instance;
}

/**
 * Hostname substrings that mean "this is the production Postgres."
 * Matched against DATABASE_URL (case-insensitive). Add more patterns
 * here if prod ever moves off Railway.
 */
const PROD_DB_HOST_PATTERNS = ['railway.app', 'railway.internal'];

/**
 * Refuse to start when NODE_ENV is not production but DATABASE_URL
 * points at a known production host. Prevents the foot-gun where a
 * developer's `pnpm dev` accidentally connects local indexers and
 * `prisma migrate dev` to prod via a copy-pasted env value.
 *
 * Override with `ALLOW_PROD_DB_FROM_DEV=true` if you genuinely need
 * to point dev tooling at prod (e.g. read-only debugging). When
 * overridden, a loud warning is logged on every boot.
 */
const guardAgainstProdFromDev = (): void => {
  // Only fire on developer laptops or CI — a deployed environment
  // (production, staging, etc.) has its DATABASE_URL wired in by
  // deploy config, not a copy-pasted .env, and is allowed to point
  // wherever its platform configures.
  if (!config.isDev && !config.isTest) return;
  const url = config.DATABASE_URL.toLowerCase();
  const looksLikeProd = PROD_DB_HOST_PATTERNS.some((p) => url.includes(p));
  if (!looksLikeProd) return;

  if (process.env.ALLOW_PROD_DB_FROM_DEV === 'true') {
    log.warn(
      'NODE_ENV is not production but DATABASE_URL looks like prod. ' +
        'Proceeding because ALLOW_PROD_DB_FROM_DEV=true. Be careful — ' +
        'local indexers and prisma migrate dev will write to prod.'
    );
    return;
  }

  log.fatal(
    {
      hint: 'Set DATABASE_URL to a local dev DB, or pass ALLOW_PROD_DB_FROM_DEV=true to override.',
    },
    'REFUSING TO START: DATABASE_URL matches a production hostname pattern but NODE_ENV is not production'
  );
  process.exit(1);
};

// Initialize database connection
export const initializeDataSource = async () => {
  guardAgainstProdFromDev();
  try {
    await getInstance().$connect();
    log.info('Prisma connected');
  } catch (err) {
    log.error({ err }, 'Prisma connection failed');
    throw err;
  }
};

/**
 * Lazily-initialized Prisma client singleton.
 *
 * The PrismaClient is created on first property access, not at import
 * time. This allows build-time scripts (e.g. emit-schema) to import
 * modules that transitively depend on prisma without needing a
 * database connection.
 */
const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_, prop) {
    getInstance();
    const target = _extendedInstance ?? _instance!;
    const value = Reflect.get(target, prop, target);
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(target)
      : value;
  },
});

export default prisma;
