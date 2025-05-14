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
import { NUMERIC_PRECISION } from '../constants';

@Entity()
@Unique(['address', 'chainId'])
export class MarketGroup {
  @OneToMany(() => Market, (market) => market.marketGroup, {
    cascade: true,
    lazy: true
  })
  markets: Promise<Market[]>;

  @OneToMany(() => Event, (event) => event.marketGroup)
  events: Event[];

  @ManyToOne(() => Resource, (resource) => resource.marketGroups, {
    nullable: true,
  })
  resource: Resource | null;

  @ManyToOne(() => Category, (category) => category.marketGroups)
  category: Category;

  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'varchar', nullable: true })
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

  @Column({ type: 'varchar', nullable: true })
  collateralSymbol: string | null;

  @Column({ type: 'integer', nullable: true })
  collateralDecimals: number | null;

  @Column({
    type: 'numeric',
    precision: NUMERIC_PRECISION,
    scale: 0,
    nullable: true,
  })
  minTradeSize: string | null;

  @Column({ type: 'text', nullable: true })
  question: string | null;

  @Column({ type: 'varchar', nullable: true })
  baseTokenName: string | null;

  @Column({ type: 'varchar', nullable: true })
  quoteTokenName: string | null;

  @Column({ type: 'varchar', nullable: true })
  initializationNonce: string;

  @Column({ type: 'varchar', nullable: true })
  factoryAddress: string | null;

  @Column(() => MarketParams)
  marketParams: MarketParams;
}
