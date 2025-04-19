import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToOne,
  Unique,
  ManyToOne,
  Index,
} from 'typeorm';
import { Transaction } from './Transaction';
import { MarketGroup } from './MarketGroup';

@Entity()
@Unique(['transactionHash', 'marketGroup', 'blockNumber', 'logIndex'])
export class Event {
  @OneToOne(() => Transaction, (transaction) => transaction.event)
  transaction: Transaction;

  @ManyToOne(() => MarketGroup, (marketGroup) => marketGroup.events)
  marketGroup: MarketGroup;

  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'integer' })
  @Index()
  blockNumber: number;

  @Column({ type: 'varchar' })
  transactionHash: string;

  @Column({ type: 'bigint' })
  @Index()
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
