import { NUMERIC_PRECISION } from "../constants";
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
  OneToOne,
} from "typeorm";
import { Transaction } from "./Transaction";

@Entity()
@Unique(["transactionHash"])
export class CollateralTransfer {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @OneToOne(() => Transaction, (transaction) => transaction.collateralTransfer)
  transaction: Transaction;

  @Column({ type: "varchar" })
  transactionHash: string;

  @Column({ type: "integer" })
  timestamp: number;

  @Column({ type: "varchar" })
  owner: string;

  @Column({ type: "numeric", precision: NUMERIC_PRECISION, scale: 0 })
  collateral: string; // i.e. wstETH
}