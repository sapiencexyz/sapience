import { PrismaClient } from '../generated/prisma';
import { config } from './config';

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
        : (['query', 'info', 'warn', 'error'] as const)
      : (['warn', 'error'] as const),
    transactionOptions: {
      maxWait: config.PRISMA_QUERY_TIMEOUT_MS,
      timeout: config.PRISMA_QUERY_TIMEOUT_MS,
    },
  });

  // Query timeout middleware - bounds individual query execution time
  _instance.$use(async (params, next) => {
    const timeout = config.PRISMA_QUERY_TIMEOUT_MS;
    let timer: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new Error(
            `Query timeout: ${params.model}.${params.action} exceeded ${timeout}ms`
          )
        );
      }, timeout);
    });

    try {
      return await Promise.race([next(params), timeoutPromise]);
    } finally {
      clearTimeout(timer!);
    }
  });

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
 * The PrismaClient is created on first property access, not at import time.
 * This allows build-time scripts (e.g. emit-schema) to import modules that
 * transitively depend on prisma without needing a database connection.
 */
const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_, prop) {
    const target = getInstance();
    const value = Reflect.get(target, prop, target);
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(target)
      : value;
  },
});

export default prisma;
