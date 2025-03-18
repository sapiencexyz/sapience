import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class PerformanceCache {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'varchar' })
  resourceSlug: string;

  @Column({ type: 'varchar' })
  interval: number;

  @Column({ type: 'varchar' })
  jsonSection: string;

  @Column({ type: 'varchar', nullable: true })
  storageVersion: string;

  @Column({ type: 'varchar' })
  latestTimestamp: number;

  @Column({ type: 'jsonb' })
  storage: string;
}
