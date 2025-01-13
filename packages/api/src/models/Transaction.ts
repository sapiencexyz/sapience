import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from "typeorm";
import { Event } from "./Event";
import { Position } from "./Position";
import { MarketPrice } from "./MarketPrice";
import { NUMERIC_PRECISION } from "../constants";
import { CollateralTransfer } from "./CollateralTransfer";

export enum TransactionType {
  ADD_LIQUIDITY = "addLiquidity",
  REMOVE_LIQUIDITY = "removeLiquidity",
  LONG = "long",
  SHORT = "short",
  SETTLE_POSITION = "settledPosition",
}

@Entity()
export class Transaction {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @OneToOne(
    () => Event,
    (event) => event.transaction,
  )
  @JoinColumn()
  event: Event;

  @ManyToOne(
    () => Position,
    (position) => position.transactions,
  )
  position: Position;

  @OneToOne(
    () => MarketPrice,
    (mp) => mp.transaction,
  )
  @JoinColumn()
  marketPrice: MarketPrice;

  @OneToOne(
    () => CollateralTransfer,
    (ct) => ct.transaction,
  )
  @JoinColumn()
  collateralTransfer: CollateralTransfer;

  @Column({
    type: "numeric",
    precision: NUMERIC_PRECISION,
    scale: 0,
    nullable: true,
  })
  tradeRatioD18: string;

  @Column({
    type: "simple-enum",
    enum: TransactionType,
  })
  type: TransactionType;

  // Position State at the time of the transaction
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

  // LP Delta Token Amounts
  @Column({
    type: "numeric",
    precision: NUMERIC_PRECISION,
    scale: 0,
    nullable: true,
  })
  lpBaseDeltaToken: string; // vGas tokenamount 0

  @Column({
    type: "numeric",
    precision: NUMERIC_PRECISION,
    scale: 0,
    nullable: true,
  })
  lpQuoteDeltaToken: string; // vETH tokenamount 1
}
