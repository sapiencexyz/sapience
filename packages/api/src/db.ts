import { PrismaClient } from '../generated/prisma';
import { config } from './config';

// Create Prisma client with appropriate logging and query timeout
const prisma = new PrismaClient({
  log: config.isProd ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
  transactionOptions: {
    maxWait: config.PRISMA_QUERY_TIMEOUT_MS,
    timeout: config.PRISMA_QUERY_TIMEOUT_MS,
  },
});

// Query timeout middleware - bounds individual query execution time
prisma.$use(async (params, next) => {
  const timeout = config.PRISMA_QUERY_TIMEOUT_MS;

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(
        new Error(
          `Query timeout: ${params.model}.${params.action} exceeded ${timeout}ms`
        )
      );
    }, timeout);
  });

  return Promise.race([next(params), timeoutPromise]);
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
