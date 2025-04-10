import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Market } from './Market';
import { Resource } from './Resource';

@Entity()
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'varchar', unique: true })
  name: string;

  @Column({ type: 'varchar', unique: true })
  @Index()
  slug: string;

  @OneToMany(() => Market, (market) => market.category)
  markets: Market[];

  @OneToMany(() => Resource, (resource) => resource.category)
  resources: Resource[];
}
