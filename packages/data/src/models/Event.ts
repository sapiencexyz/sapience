import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  AfterInsert,
  AfterUpdate,
  CreateDateColumn,
  OneToOne,
  Unique,
  ManyToOne,
} from "typeorm";
import { upsertEntitiesFromEvent } from "../controllers/market";
import { Transaction } from "./Transaction";
import { Market } from "./Market";

@Entity()
@Unique(["market", "blockNumber", "logIndex"])
export class Event {
  @OneToOne(() => Transaction, (transaction) => transaction.event)
  transaction: Transaction;

  @ManyToOne(() => Market, (market) => market.events)
  market: Market;

  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column()
  blockNumber: number;

  @Column({ type: "bigint" })
  timestamp: string; //In seconds

  @Column()
  logIndex: number;

  @Column({ type: "json" })
  logData!: { eventName: string; args: Record<string, any> };

  @AfterInsert()
  async afterInsert() {
    console.log("Event inserted: " + this.id);
    try {
      await upsertEntitiesFromEvent(this);
    } catch (e) {
      console.error("Error upserting entities from event:", e);
    }
  }

  @AfterUpdate()
  async afterUpdate() {
    console.log(`Event updated: ${this.id}`);
    try {
      await upsertEntitiesFromEvent(this);
    } catch (e) {
      console.error("Error upserting entities from event:", e);
    }
  }
}
