import { DataSource } from "typeorm";
import { Position } from "./models/Position";
import { ResourcePrice } from "./models/ResourcePrice";
import { Transaction } from "./models/Transaction";
import { Event } from "./models/Event";
import { Market } from "./models/Market";
import { Epoch } from "./models/Epoch";
import { MarketPrice } from "./models/MarketPrice";
import { RenderJob } from "./models/RenderJob";
import { IndexPrice } from "./models/IndexPrice";

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
  logging: ["warn", "error", "log", "info"],
  entities: [
    ResourcePrice,
    Position,
    Transaction,
    Event,
    Market,
    Epoch,
    MarketPrice,
    RenderJob,
    IndexPrice,
  ],
});

const postgresDataSource: DataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  synchronize: true,
  logging: ["warn", "error", "log", "info"],
  entities: [
    ResourcePrice,
    Position,
    Transaction,
    Event,
    Market,
    Epoch,
    MarketPrice,
    RenderJob,
    IndexPrice,
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
export const resourcePriceRepository = dataSource.getRepository(ResourcePrice);
export const marketPriceRepository = dataSource.getRepository(MarketPrice);
export const renderJobRepository = dataSource.getRepository(RenderJob);
export const indexPriceRepository = dataSource.getRepository(IndexPrice);

export default dataSource;
