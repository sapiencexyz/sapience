import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  AfterInsert,
  AfterRemove,
  AfterUpdate,
  CreateDateColumn,
  OneToOne,
  JoinColumn,
  Unique,
  ManyToOne,
} from "typeorm";
import { upsertPositionFromLiquidityEvent } from "../util/dbUtil";
import { Transaction } from "./Transaction";
import { LIQUIDITY_POSITION_EVENT_NAME } from "../interfaces/interfaces";
import { Epoch } from "./Epoch";

@Entity()
@Unique(["epoch", "blockNumber", "logIndex"])
export class Event {
  @OneToOne(() => Transaction, (transaction) => transaction.event, {
    cascade: true,
  })
  @JoinColumn()
  transaction: Transaction;

  @ManyToOne(() => Epoch, (epoch) => epoch.events)
  epoch: Epoch;

  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: "bigint" })
  blockNumber: string;

  @Column()
  logIndex: number;

  @Column({ type: "json" })
  logData!: { eventName: string; args: Record<string, any> };

  // All should fail without crashing
  @AfterInsert()
  async afterInsert() {
    console.log(`!!!!Event inserted: ${this.id}`);
    // Upsert associated Position or Transaction
    if (this.logData.eventName === LIQUIDITY_POSITION_EVENT_NAME) {
      try {
        await upsertPositionFromLiquidityEvent(this);
      } catch (error) {
        console.error("Error upserting position:", error);
      }
    }
  }

  @AfterUpdate()
  afterUpdate() {
    console.log(`Event updated: ${this.id}`);
    // Upsert associated Position or Transaction
  }

  @AfterRemove()
  afterRemove() {
    console.log(`Event removed: ${this.id}`);
    // Delete associated Position or Transaction
  }
}
