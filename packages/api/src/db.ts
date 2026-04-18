import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma';
import { config } from './config';

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
