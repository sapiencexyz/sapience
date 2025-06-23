import { NUMERIC_PRECISION } from '../constants';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
  Index,
} from 'typeorm';

@Entity()
@Unique(['paramName'])
export class CacheParam {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  // Chart type identification
  @Column({ type: 'varchar' })
  @Index()
  paramName: string;

  @Column({ type: 'numeric', precision: NUMERIC_PRECISION, scale: 0 })
  paramValueNumber: number;

  @Column({ type: 'text', nullable: true })
  paramValueString: string | null;
}
