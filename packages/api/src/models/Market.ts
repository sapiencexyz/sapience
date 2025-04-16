import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  Unique,
  Index,
} from 'typeorm';
import { MarketGroup } from './MarketGroup';
import { Position } from './Position';
import { NUMERIC_PRECISION } from '../constants';
import { MarketParams } from './MarketParams';

@Entity()
@Unique(['marketGroup', 'marketId'])
export class Market {
  @ManyToOne(() => MarketGroup, (marketGroup) => marketGroup.markets)
  @Index()
  marketGroup: MarketGroup;

  @OneToMany(() => Position, (position) => position.market)
  positions: Position[];

  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'integer' })
  @Index()
  marketId: number;

  @Column({ type: 'integer', nullable: true })
  startTimestamp: number | null;

  @Column({ type: 'integer', nullable: true })
  endTimestamp: number | null;

  @Column({
    type: 'numeric',
    precision: NUMERIC_PRECISION,
    scale: 0,
    nullable: true,
  })
  startingSqrtPriceX96: string | null;

  @Column(() => MarketParams)
  marketParams: MarketParams;

  // TODO REVIEW (MERGE CONFLICT)
  @Column({
    type: 'numeric',
    precision: NUMERIC_PRECISION,
    scale: 0,
    nullable: true,
  })
  settlementPriceD18: string | null;

  @Column({ type: 'integer', nullable: true })
  collateralDecimals: number | null;

  @Column({ type: 'text', nullable: true })
  question: string | null;
  // TODO REVIEW (MERGE CONFLICT)

  @Column({
    type: 'boolean',
    nullable: true,
  })
  settled: boolean | null;

  @Column('int', { nullable: true })
  baseAssetMinPriceTick: number | null;

  @Column('int', { nullable: true })
  baseAssetMaxPriceTick: number | null;

  @Column({
    type: 'numeric',
    precision: NUMERIC_PRECISION,
    scale: 0,
    nullable: true,
  })
  minPriceD18: string | null;

  @Column({
    type: 'numeric',
    precision: NUMERIC_PRECISION,
    scale: 0,
    nullable: true,
  })
  maxPriceD18: string | null;

  @Column({ type: 'boolean', default: true })
  public: boolean;

  @Column({ type: 'text', nullable: true })
  question: string | null;
}
