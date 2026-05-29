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

let _instance: PrismaClient | undefined;
let _extendedInstance: PrismaClient | undefined;

function getInstance(): PrismaClient {
  if (_instance) return _instance;

  // Bound the connection pool to avoid exhausting DB connections.
  // In Prisma 7 these params come from the adapter (pg connection
  // options), not from query-string params on DATABASE_URL, because
  // the Rust engine that used to parse those is gone.
  const adapter = new PrismaPg({
    connectionString: config.DATABASE_URL,
    max: config.CONNECTION_POOL_SIZE,
    idleTimeoutMillis: 10_000,
  });

  _instance = new PrismaClient({
    adapter,
    log: config.isProd
      ? (['info', 'warn', 'error'] as const)
      : (['warn', 'error'] as const),
    transactionOptions: {
      maxWait: config.PRISMA_QUERY_TIMEOUT_MS,
      timeout: config.PRISMA_QUERY_TIMEOUT_MS,
    },
  });

  // `$use` was removed in Prisma 6.16+; the modern equivalent is
  // `$extends({ query: { $allOperations } })`. We compose the old
  // three middlewares (timing, counter, timeout) into one wrapper.
  _extendedInstance = _instance.$extends({
    query: {
      $allOperations: async ({ model, operation, args, query }) => {
        const store = requestContext.getStore();
        if (store) store.count++;

        const timeout = config.PRISMA_QUERY_TIMEOUT_MS;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(
              new Error(
                `Query timeout: ${model ?? 'raw'}.${operation} exceeded ${timeout}ms`
              )
            );
          }, timeout);
        });

        const start = performance.now();
        try {
          const result = await Promise.race([query(args), timeoutPromise]);
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
        } finally {
          if (timer) clearTimeout(timer);
        }
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
