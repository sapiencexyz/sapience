import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToOne,
  Unique,
  JoinColumn,
} from "typeorm";
import { Transaction } from "./Transaction";
import { NUMERIC_PRECISION } from "../util/dbUtil";

@Entity()
export class MarketPrice {
  @OneToOne(() => Transaction, (transaction) => transaction.marketPrice)
  transaction: Transaction;

  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: "bigint" })
  timestamp: string;

  @Column({ type: "numeric", precision: NUMERIC_PRECISION, scale: 0 })
  value: string;
}
