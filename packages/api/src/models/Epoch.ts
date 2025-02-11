import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  Unique,
} from 'typeorm';
import { Market } from './Market';
import { Position } from './Position';
import { NUMERIC_PRECISION } from '../constants';
import { MarketParams } from './MarketParams';

@Entity()
@Unique(['market', 'epochId'])
export class Epoch {
  @ManyToOne(() => Market, (market) => market.epochs)
  market: Market;

  @OneToMany(() => Position, (position) => position.epoch)
  positions: Position[];

  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'integer' })
  epochId: number;

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

  @Column({
    type: 'numeric',
    precision: NUMERIC_PRECISION,
    scale: 0,
    nullable: true,
  })
  settlementPriceD18: string | null;

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
}
