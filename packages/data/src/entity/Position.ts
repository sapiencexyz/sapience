import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  ManyToOne,
  Unique,
} from "typeorm";
import { Transaction } from "./Transaction";
import {
  TOKEN_PRECISION,
  DECIMAL_SCALE,
  NUMERIC_PRECISION,
} from "../constants";
import { Epoch } from "./Epoch";

@Entity()
@Unique(["positionId", "epoch"])
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
  positionId: number;

  @Column({ nullable: true })
  owner: string;

  @Column({
    type: "numeric",
    precision: NUMERIC_PRECISION,
    scale: 0,
    nullable: true,
  })
  baseToken: string; // vGas tokenamount 0

  @Column({
    type: "numeric",
    precision: NUMERIC_PRECISION,
    scale: 0,
    nullable: true,
  })
  quoteToken: string; // vETH tokenamount 1

  @Column({
    type: "numeric",
    precision: NUMERIC_PRECISION,
    scale: 0,
    nullable: true,
  })
  borrowedBaseToken: string;

  @Column({
    type: "numeric",
    precision: NUMERIC_PRECISION,
    scale: 0,
    nullable: true,
  })
  borrowedQuoteToken: string;

  @Column({ type: "numeric", precision: NUMERIC_PRECISION, scale: 0 })
  collateral: string; // ETH

  @Column()
  isLP: boolean; // true for event name

  @Column({
    type: "numeric",
    nullable: true,
    precision: TOKEN_PRECISION, // Total number of significant digits
    scale: DECIMAL_SCALE, // Number of digits after the decimal point
  })
  highPrice: string;

  @Column({
    type: "numeric",
    nullable: true,
    precision: TOKEN_PRECISION, // Total number of significant digits
    scale: DECIMAL_SCALE, // Number of digits after the decimal point
  })
  lowPrice: string;

  @Column({
    type: "numeric",
    nullable: true,
    precision: TOKEN_PRECISION, // Total number of significant digits
    scale: DECIMAL_SCALE, // Number of digits after the decimal point
  })
  unclaimedFees: string; // ETH
}
