import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient } from '../generated/prisma';
import { config } from './config';

export const requestContext = new AsyncLocalStorage<{
  count: number;
  requestId: string;
}>();

let _instance: PrismaClient | undefined;

function getInstance(): PrismaClient {
  if (_instance) return _instance;

  // Ensure the connection pool is bounded to prevent exhausting database connections.
  // Appends connection_limit and pool_timeout to DATABASE_URL if not already present.
  const dbUrl = new URL(config.DATABASE_URL);
  if (!dbUrl.searchParams.has('connection_limit')) {
    dbUrl.searchParams.set(
      'connection_limit',
      String(config.CONNECTION_POOL_SIZE)
    );
  }
  if (!dbUrl.searchParams.has('pool_timeout')) {
    dbUrl.searchParams.set('pool_timeout', '10');
  }

  // Create Prisma client with appropriate logging and query timeout
  _instance = new PrismaClient({
    datasourceUrl: dbUrl.toString(),
    log: config.isProd
      ? config.DATABASE_URL.includes('localhost')
        ? (['info', 'warn', 'error'] as const)
        : (['info', 'warn', 'error'] as const)
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
          const ms = performance.now() - start;
          const rid = store?.requestId ?? '';
          const prefix = rid ? `[prisma:${rid}]` : '[prisma]';
          console.log(
            `${prefix} ${model ?? 'raw'}.${operation} ${ms.toFixed(1)}ms`
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

let _extendedInstance: PrismaClient | undefined;

// Initialize database connection
export const initializeDataSource = async () => {
  try {
    await getInstance().$connect();
    console.log('Prisma has connected to the database!');
  } catch (err) {
    console.error('Error during Prisma connection', err);
    throw err;
  }
};

/**
 * Lazily-initialized Prisma client singleton.
 *
 * The PrismaClient is created on first property access, not at import time.
 * This allows build-time scripts (e.g. emit-schema) to import modules that
 * transitively depend on prisma without needing a database connection.
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
