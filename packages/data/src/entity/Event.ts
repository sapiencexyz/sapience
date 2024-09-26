import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  AfterInsert,
  AfterRemove,
  AfterUpdate,
  CreateDateColumn,
  OneToOne,
  Unique,
  ManyToOne,
} from "typeorm";
import { upsertTransactionPositionPriceFromEvent } from "../util/dbUtil";
import { Transaction } from "./Transaction";
import { Epoch } from "./Epoch";

@Entity()
@Unique(["epoch", "blockNumber", "logIndex"])
export class Event {
  @OneToOne(() => Transaction, (transaction) => transaction.event)
  transaction: Transaction;

  @ManyToOne(() => Epoch, (epoch) => epoch.events)
  epoch: Epoch;

  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: "bigint" })
  blockNumber: string;

  @Column({ type: "bigint" })
  timestamp: string; //In seconds

  @Column()
  logIndex: number;

  @Column({ type: "json" })
  logData!: { eventName: string; args: Record<string, any> };

  // All should fail without crashing
  @AfterInsert()
  async afterInsert() {
    console.log("Event inserted: " + this.id);
    // Upsert associated Transaction
    await upsertTransactionPositionPriceFromEvent(this);
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
