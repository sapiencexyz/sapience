import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  AfterInsert,
  AfterRemove,
  AfterUpdate,
  CreateDateColumn,
  OneToMany,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from "typeorm";
import { Event } from "./Event";
import { Position } from "./Position";
import { MarketPrice } from "./MarketPrice";
import { NUMERIC_PRECISION } from "../util/dbUtil";
// Read contractIds (chainId:address) from foilconfig.json ?

export enum TransactionType {
  ADD_LIQUIDITY = "addLiquidity",
  REMOVE_LIQUIDITY = "removeLiquidity",
  LONG = "long",
  SHORT = "short",
}
/**
/* Alternatively:
/* setBaseTokenAmount, with baseTokenAmountSet event
/* setQuoteTokenAmount, with quoteTokenAmountSet event
/* setLiquidityAmount, with liquidityAmountSet event
/* setCollateralAmount, with collateralAmountSet event
/* In this case, the event just emits the parameters and they're recorded verbatim.
**/

@Entity()
export class Transaction {
  @OneToOne(() => MarketPrice, (mp) => mp.transaction, {
    cascade: true,
  })
  @JoinColumn()
  marketPrice: MarketPrice;

  @OneToOne(() => Event, (event) => event.transaction, {
    cascade: true,
  })
  @JoinColumn()
  event: Event;

  @ManyToOne(() => Position, (position) => position.transactions)
  @JoinColumn()
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
  baseTokenDelta: string; // vGas

  @Column({ type: "numeric", precision: NUMERIC_PRECISION, scale: 0 })
  quoteTokenDelta: string; // vETH

  @Column({ type: "numeric", precision: NUMERIC_PRECISION, scale: 0 })
  collateralDelta: string; // ETH

  // AfterInsert AfterUpdate and AfterRemove to update the associated Position based on nftId

  // @after insert: create MarketPrice (if long or short txn type)
  @AfterInsert()
  async afterInsert() {
    // Upsert associated Position or Transaction
    if (
      this.type === TransactionType.LONG ||
      this.type === TransactionType.SHORT
    ) {
      try {
        //  await upsertPositionFromLiquidityEvent(this);
      } catch (error) {
        console.error("Error upserting Market Price:", error);
      }
    }
  }

  @AfterUpdate()
  afterUpdate() {
    console.log(`TXN updated: ${this.id}`);
    // Upsert associated MarketPrice and Position based on nftId
  }

  @AfterRemove()
  afterRemove() {
    console.log(`TXN removed: ${this.id}`);
    // Delete associated MarketPrice and Position based on nftId
  }
}
