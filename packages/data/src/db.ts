import { DataSource } from "typeorm";
import { Position } from "./entity/Position";
import { Price } from "./entity/Price";
import { Transaction } from "./entity/Transaction";
import { Event } from "./entity/Event";
import { MarketPrice } from "./entity/MarketPrice";

const isProduction = process.env.NODE_ENV === "production";
const devDatabase = process.env.POSTGRES_USER;
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
  entities: [Price, Position, Transaction, Event, MarketPrice],
});

const postgresDataSource: DataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  synchronize: true,
  logging: true,
  entities: [Price, Position, Transaction, Event, MarketPrice],
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

export default dataSource;
