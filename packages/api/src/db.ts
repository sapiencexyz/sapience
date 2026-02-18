import { PrismaClient } from '../generated/prisma';
import { config } from './config';

// Ensure the connection pool is bounded to prevent exhausting database connections.
// Appends connection_limit and pool_timeout to DATABASE_URL if not already present.
const dbUrl = new URL(config.DATABASE_URL);
if (!dbUrl.searchParams.has('connection_limit')) {
  dbUrl.searchParams.set('connection_limit', String(config.CONNECTION_POOL_SIZE));
}
if (!dbUrl.searchParams.has('pool_timeout')) {
  dbUrl.searchParams.set('pool_timeout', '10');
}

// Create Prisma client with appropriate logging and query timeout
const prisma = new PrismaClient({
  datasourceUrl: dbUrl.toString(),
  log: config.isProd ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
  transactionOptions: {
    maxWait: config.PRISMA_QUERY_TIMEOUT_MS,
    timeout: config.PRISMA_QUERY_TIMEOUT_MS,
  },
});

// Query timeout middleware - bounds individual query execution time
prisma.$use(async (params, next) => {
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

// Initialize database connection
export const initializeDataSource = async () => {
  try {
    await prisma.$connect();
    console.log('Prisma has connected to the database!');
  } catch (err) {
    console.error('Error during Prisma connection', err);
    throw err;
  }
};

// Export the prisma client as default
export default prisma;
