import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToOne,
  Unique,
  ManyToOne,
} from 'typeorm';
import { Transaction } from './Transaction';
import { Market } from './Market';

@Entity()
@Unique(['transactionHash', 'market', 'blockNumber', 'logIndex'])
export class Event {
  @OneToOne(() => Transaction, (transaction) => transaction.event)
  transaction: Transaction;

  @ManyToOne(() => Market, (market) => market.events)
  market: Market;

  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'integer' })
  blockNumber: number;

  @Column({ type: 'varchar' })
  transactionHash: string;

  @Column({ type: 'bigint' })
  timestamp: string; // In seconds

  @Column({ type: 'integer' })
  logIndex: number;

  @Column({ type: 'json' })
  logData!: {
    eventName: string;
    args: Record<string, unknown>;
    transactionHash: string;
    blockHash: string;
    blockNumber: string;
    data: string;
    logIndex: number;
    removed: boolean;
    topics: string[];
    transactionIndex: number;
  };
}
