import { PrismaClient } from '../generated/prisma';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const renderServiceName = process.env.RENDER_SERVICE_NAME;
const shouldLogInLive =
  renderServiceName === 'candle-cache-builder' ? false : true;

const isLive =
  process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';

// Create Prisma client with appropriate logging
const prisma = new PrismaClient({
  log:
    isLive && shouldLogInLive
      ? ['query', 'info', 'warn', 'error']
      : ['warn', 'error'],
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
