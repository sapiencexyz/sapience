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
import { handleEventAfterUpsert } from "../controllers/market";
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

  @AfterInsert()
  async afterInsert() {
    console.log("Event inserted: " + this.id);
    await handleEventAfterUpsert(this);
  }

  @AfterUpdate()
  async afterUpdate() {
    console.log(`Event updated: ${this.id}`);
    await handleEventAfterUpsert(this);
  }
}
