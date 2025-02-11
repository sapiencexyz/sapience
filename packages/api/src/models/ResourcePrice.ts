import { NUMERIC_PRECISION } from '../constants';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
  ManyToOne,
} from 'typeorm';
import { Resource } from './Resource';

@Entity()
@Unique(['resource', 'timestamp'])
export class ResourcePrice {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Resource, (resource) => resource.resourcePrices)
  resource: Resource;

  @Column({ type: 'integer' })
  blockNumber: number;

  @Column({ type: 'integer' })
  timestamp: number;

  @Column({ type: 'numeric', precision: NUMERIC_PRECISION, scale: 0 })
  value: string;

  @Column({ type: 'numeric', precision: NUMERIC_PRECISION, scale: 0 })
  used: string;

  @Column({ type: 'numeric', precision: NUMERIC_PRECISION, scale: 0 })
  feePaid: string;
}
