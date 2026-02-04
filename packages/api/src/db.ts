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
