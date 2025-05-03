import { DataSource } from 'typeorm';
import { Position } from './models/Position';
import { ResourcePrice } from './models/ResourcePrice';
import { Transaction } from './models/Transaction';
import { Event } from './models/Event';
import { MarketGroup } from './models/MarketGroup';
import { Market } from './models/Market';
import { MarketPrice } from './models/MarketPrice';
import { RenderJob } from './models/RenderJob';
import { CollateralTransfer } from './models/CollateralTransfer';
import { Resource } from './models/Resource';
import { Category } from './models/Category';
import { CryptoPrice } from './models/CryptoPrice';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const isLive =
  process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';

const devDataSource: DataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: false,
  logging: false,
  logger: 'advanced-console',
  migrations: ['src/migrations/*.ts'],
  ssl: !process.env.DATABASE_URL?.includes('localhost'),
  entities: [
    ResourcePrice,
    Position,
    Transaction,
    Event,
    MarketGroup,
    Market,
    MarketPrice,
    RenderJob,
    CollateralTransfer,
    Resource,
    Category,
    CryptoPrice,
  ],
});

const postgresDataSource: DataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: false,
  logging: true,
  logger: 'advanced-console',
  migrations: ['src/migrations/*.ts'],
  entities: [
    ResourcePrice,
    Position,
    Transaction,
    Event,
    MarketGroup,
    Market,
    MarketPrice,
    RenderJob,
    CollateralTransfer,
    Resource,
    Category,
    CryptoPrice,
  ],
});

const dataSource = isLive ? postgresDataSource : devDataSource;

// Initialize database connection
export const initializeDataSource = async () => {
  if (!dataSource.isInitialized) {
    await dataSource
      .initialize()
      .then(() => {
        console.log('Data Source has been initialized!');
      })
      .catch((err) => {
        console.error('Error during Data Source initialization', err);
      });
  }
};

export const marketGroupRepository = dataSource.getRepository(MarketGroup);
export const marketRepository = dataSource.getRepository(Market);
export const positionRepository = dataSource.getRepository(Position);
export const transactionRepository = dataSource.getRepository(Transaction);
export const eventRepository = dataSource.getRepository(Event);
export const resourceRepository = dataSource.getRepository(Resource);
export const resourcePriceRepository = dataSource.getRepository(ResourcePrice);
export const marketPriceRepository = dataSource.getRepository(MarketPrice);
export const renderJobRepository = dataSource.getRepository(RenderJob);
export const collateralTransferRepository =
  dataSource.getRepository(CollateralTransfer);
export const categoryRepository = dataSource.getRepository(Category);
export const cryptoPriceRepository = dataSource.getRepository(CryptoPrice);

export default dataSource;
