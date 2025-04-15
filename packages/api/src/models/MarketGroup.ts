import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
  OneToMany,
  ManyToOne,
  Index,
} from 'typeorm';
import { Market } from './Market';
import { MarketParams } from './MarketParams';
import { Event } from './Event';
import { Resource } from './Resource';
import { Category } from './Category';

@Entity()
@Unique(['address', 'chainId'])
export class MarketGroup {
  @OneToMany(() => Market, (market) => market.marketGroup, {
    cascade: true,
  })
  markets: Market[];

  @OneToMany(() => Event, (event) => event.marketGroup)
  events: Event[];

  @ManyToOne(() => Resource, (resource) => resource.marketGroups)
  resource: Resource;

  @ManyToOne(() => Category, (category) => category.marketGroups)
  category: Category;

  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'varchar' })
  @Index()
  address: string;

  @Column({ type: 'varchar', nullable: true })
  vaultAddress: string;

  @Column({ type: 'boolean', default: false })
  isYin: boolean;

  @Column({ type: 'boolean', default: false })
  isCumulative: boolean;

  @Column({ type: 'integer' })
  @Index()
  chainId: number;

  @Column({ type: 'integer', nullable: true })
  deployTimestamp: number | null;

  @Column({ type: 'integer', nullable: true })
  deployTxnBlockNumber: number | null;

  @Column({ type: 'varchar', nullable: true })
  owner: string | null;

  @Column({ type: 'varchar', nullable: true })
  collateralAsset: string | null;

  @Column({ type: 'text', nullable: true })
  question: string | null;

  @Column({ type: 'varchar', nullable: true })
  baseTokenName: string | null;

  @Column({ type: 'varchar', nullable: true })
  quoteTokenName: string | null;

  @Column({ type: 'simple-array', nullable: true })
  optionNames: string[] | null;

  @Column(() => MarketParams)
  marketParams: MarketParams;
}
