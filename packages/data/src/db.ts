import { DataSource } from "typeorm";
import { Position } from "./entity/Position";
import { IndexPrice } from "./entity/IndexPrice";
import { Transaction } from "./entity/Transaction";
import { Event } from "./entity/Event";
import { Market } from "./entity/Market";
import { Epoch } from "./entity/Epoch";
import { MarketPrice } from "./entity/MarketPrice";

const isProduction = process.env.NODE_ENV === "production";
const devDatabase = process.env.POSTGRES_DB;
const devUsername = process.env.POSTGRES_USER;

const devDataSource: DataSource = new DataSource({
  type: "postgres",
  database: devDatabase,
  port: 5432,
  username: devUsername,
  host: "localhost",
  url: "postgresql://localhost",
  synchronize: true,
  logging: true,
  entities: [
    IndexPrice,
    Position,
    Transaction,
    Event,
    Market,
    Epoch,
    MarketPrice,
  ],
});

const postgresDataSource: DataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  synchronize: true,
  logging: true,
  entities: [
    IndexPrice,
    Position,
    Transaction,
    Event,
    Market,
    Epoch,
    MarketPrice,
  ],
});

const dataSource = isProduction ? postgresDataSource : devDataSource;

// Initialize database connection
export const initializeDataSource = async () => {
  if (!dataSource.isInitialized) {
    await dataSource
      .initialize()
      .then(() => {
        console.log("Data Source has been initialized!");
      })
      .catch((err) => {
        console.error("Error during Data Source initialization", err);
      });
  }
};

export const marketRepository = dataSource.getRepository(Market);
export const epochRepository = dataSource.getRepository(Epoch);
export const positionRepository = dataSource.getRepository(Position);
export const transactionRepository = dataSource.getRepository(Transaction);
export const eventRepository = dataSource.getRepository(Event);
export const indexPriceRepository = dataSource.getRepository(IndexPrice);
export const marketPriceRepository = dataSource.getRepository(MarketPrice);

export default dataSource;
