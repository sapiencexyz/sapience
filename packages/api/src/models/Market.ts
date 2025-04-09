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
import { Epoch } from './Epoch';
import { MarketParams } from './MarketParams';
import { Event } from './Event';
import { Resource } from './Resource';
import { Category } from './Category';

@Entity()
@Unique(['address', 'chainId'])
export class Market {
  @OneToMany(() => Epoch, (epoch) => epoch.market, {
    cascade: true,
  })
  epochs: Epoch[];

  @OneToMany(() => Event, (event) => event.market)
  events: Event[];

  @ManyToOne(() => Resource, (resource) => resource.markets)
  resource: Resource;

  @ManyToOne(() => Category, (category) => category.markets)
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

  @Column({ type: 'integer', nullable: true })
  collateralDecimals: number | null;

  @Column(() => MarketParams)
  marketParams: MarketParams;
}
