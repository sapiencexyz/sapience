import { ConnectionOptions } from "typeorm";
import { Position } from "./entity/Position";
import { Price } from "./entity/Price";
import { Transaction } from "./entity/Transaction";
import { Event } from "./entity/Event";

const isProduction = process.env.NODE_ENV === 'production';

const sqliteOptions: ConnectionOptions = {
    type: "sqlite",
    database: "./data/database.sqlite",
    synchronize: true,
    logging: true,
    entities: [Price, Position, Transaction, Event],
};

const postgresOptions: ConnectionOptions = {
    type: "postgres",
    url: process.env.DATABASE_URL,
    synchronize: true,
    logging: true,
    entities: [Price, Position, Transaction, Event],
};

const connectionOptions = isProduction ? postgresOptions : sqliteOptions;

export default connectionOptions;