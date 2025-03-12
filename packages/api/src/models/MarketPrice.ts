import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToOne,
  Index,
} from 'typeorm';
import { Transaction } from './Transaction';
import { NUMERIC_PRECISION } from '../constants';

@Entity()
export class MarketPrice {
  @OneToOne(() => Transaction, (transaction) => transaction.marketPrice)
  transaction: Transaction;

  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'bigint' })
  @Index()
  timestamp: string;

  @Column({ type: 'numeric', precision: NUMERIC_PRECISION, scale: 0 })
  value: string;
}
