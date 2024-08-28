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
} from "typeorm";
import { upsertPositionFromLiquidityEvent } from "../util/dbUtil";
import { Transaction } from "./Transaction";
import { EventType } from "../interfaces/interfaces";

@Entity()
@Unique(["contractId", "blockNumber", "logIndex"])
export class Event {
  @OneToOne(() => Transaction, (transaction) => transaction.event)
  transaction: Transaction;

  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column()
  contractId: string;

  @Column({ type: "bigint" })
  blockNumber: string;

  @Column({ type: "bigint" })
  timestamp: string;

  @Column()
  logIndex: number;

  @Column({ type: "json" })
  logData!: { eventName: string; args: Record<string, any> };

  // All should fail without crashing
  @AfterInsert()
  async afterInsert() {
    // Upsert associated Position or Transaction
    if (this.logData.eventName === EventType.LiquidityPositionCreated) {
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
