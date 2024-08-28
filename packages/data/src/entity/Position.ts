import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  ManyToOne,
  Index,
  JoinColumn,
  Unique,
} from "typeorm";
import { Transaction } from "./Transaction";
import { DECIMAL_PRECISION, NUMERIC_PRECISION } from "../util/dbUtil";
// Read contractIds (chainId:address) from foilconfig.json ?
import { Epoch } from "./Epoch";
import { Market } from "./Market";

@Entity()
@Unique(["nftId", "epoch"])
export class Position {
  @OneToMany(() => Transaction, (transaction) => transaction.position)
  transactions: Transaction[];

  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Epoch, (epoch) => epoch.positions)
  epoch: Epoch;

  @Column()
  nftId: number;

  @Column({ type: "numeric", precision: NUMERIC_PRECISION, scale: 0 })
  baseToken: string; // vGas tokenamount 0

  @Column({ type: "numeric", precision: NUMERIC_PRECISION, scale: 0 })
  quoteToken: string; // vETH tokenamount 1

  @Column({ type: "numeric", precision: NUMERIC_PRECISION, scale: 0 })
  collateral: string; // ETH  needs to be added

  @Column({
    type: "numeric",
    precision: 18, // Total number of significant digits
    scale: 15, // Number of digits after the decimal point
  })
  profitLoss: string; // ETH  will calculate off chain, start at 0

  @Column()
  isLP: boolean; // true for event name

  @Column({
    type: "numeric",
    precision: 18, // Total number of significant digits
    scale: 15, // Number of digits after the decimal point
  })
  highPrice: string; // still need to add to event

  @Column({
    type: "numeric",
    precision: 18, // Total number of significant digits
    scale: 15, // Number of digits after the decimal point
  })
  lowPrice: string; // still need to add to event

  @Column({
    type: "numeric",
    precision: 18, // Total number of significant digits
    scale: 15, // Number of digits after the decimal point
  })
  unclaimedFees: string; // ETH  start at 0
}
