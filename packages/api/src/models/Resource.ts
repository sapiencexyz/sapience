import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  Index,
  ManyToOne,
} from 'typeorm';
import { MarketGroup } from './MarketGroup';
import { ResourcePrice } from './ResourcePrice';
import { Category } from './Category';

@Entity()
export class Resource {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'varchar', unique: true })
  name: string;

  @Column({ type: 'varchar', unique: true })
  @Index()
  slug: string;

  @OneToMany(() => MarketGroup, (marketGroup) => marketGroup.resource)
  marketGroups: MarketGroup[];

  @OneToMany(() => ResourcePrice, (resourcePrice) => resourcePrice.resource)
  resourcePrices: ResourcePrice[];

  @ManyToOne(() => Category, (category) => category.resources)
  category: Category;
}
