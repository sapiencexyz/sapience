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
@Unique(["transaction"])
export class MarketPrice {
  @OneToOne(() => Transaction, (transaction) => transaction.marketPrice)
  @JoinColumn()
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
