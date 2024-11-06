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

export enum TransactionType {
  ADD_LIQUIDITY = "addLiquidity",
  REMOVE_LIQUIDITY = "removeLiquidity",
  LONG = "long",
  SHORT = "short",
  SETTLE_POSITION = "settledPosition",
}

@Entity()
export class Transaction {
  @OneToOne(() => MarketPrice, (mp) => mp.transaction)
  @JoinColumn()
  marketPrice: MarketPrice;

  @OneToOne(() => Event, (event) => event.transaction)
  @JoinColumn()
  event: Event;

  @ManyToOne(() => Position, (position) => position.transactions)
  position: Position;

  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({
    type: "simple-enum",
    enum: TransactionType,
  })
  type: TransactionType;

  @Column({ type: "numeric", precision: NUMERIC_PRECISION, scale: 0 })
  baseTokenDelta: string; // vGas (signed)

  @Column({ type: "numeric", precision: NUMERIC_PRECISION, scale: 0 })
  quoteTokenDelta: string; // vETH (signed)

  @Column({ type: "numeric", precision: NUMERIC_PRECISION, scale: 0 })
  collateralDelta: string; // ETH

  @Column({
    type: "numeric",
    precision: NUMERIC_PRECISION,
    scale: 0,
    nullable: true,
  })
  tradeRatioD18: string;
}
