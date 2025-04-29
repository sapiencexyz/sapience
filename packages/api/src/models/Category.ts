import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { MarketGroup } from './MarketGroup';
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

  @OneToMany(() => MarketGroup, (marketGroup) => marketGroup.category)
  marketGroups: MarketGroup[];

  @OneToMany(() => Resource, (resource) => resource.category)
  resources: Resource[];
}
