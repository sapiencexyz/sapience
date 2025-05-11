import { NUMERIC_PRECISION } from '../constants';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity()
export class CacheCandle {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  // Chart type identification
  @Column({ type: 'varchar' })
  @Index()
  candleType: string;

  @Column({ type: 'integer' })
  @Index()
  interval: number;

  @Column({ type: 'integer' })
  @Index()
  trailingAvgTime: number;

  // Resource / Market identification
  @Column({ type: 'varchar' })
  @Index()
  resourceSlug: string;

  @Column({ type: 'integer' })
  @Index()
  marketIdx: number;

  // @Column({ type: 'integer' })
  // @Index()
  // marketGroupIdx: number;

  // Candle definition
  @Column({ type: 'integer' })
  @Index()
  timestamp: number;

  // open, high, low, close
  @Column({ type: 'varchar'  })
  open: string;

  @Column({ type: 'varchar' })
  high: string;

  @Column({ type: 'varchar' })
  low: string;

  @Column({ type: 'varchar' })
  close: string;

  // Cummulative values
  @Column({ type: 'numeric', precision: NUMERIC_PRECISION, scale: 0 })
  sumUsed: string;

  @Column({ type: 'numeric', precision: NUMERIC_PRECISION, scale: 0 })
  sumFeePaid: string;

  @Column({ type: 'integer' })
  trailingStartTimestamp: number;


  // Not normal form helpers
  @Column({ type: 'varchar', nullable: true })
  @Index()
  address: string;

  @Column({ type: 'integer' })
  @Index()
  chainId: number;

  @Column({ type: 'integer' })
  @Index()
  marketId: number;
}
