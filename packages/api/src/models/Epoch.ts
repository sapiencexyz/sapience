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
import { Market } from './Market';
import { Position } from './Position';
import { NUMERIC_PRECISION } from '../constants';
import { MarketParams } from './MarketParams';
import { Buffer } from 'buffer';

@Entity()
@Unique(['market', 'epochId'])
export class Epoch {
  @ManyToOne(() => Market, (market) => market.epochs)
  @Index()
  market: Market;

  @OneToMany(() => Position, (position) => position.epoch)
  positions: Position[];

  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'integer' })
  @Index()
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

  @Column({ type: 'boolean', default: true })
  public: boolean;

  get question(): string {
    const statement = this.marketParams?.claimStatement;

    if (!statement) {
      return 'N/A';
    }

    if (statement.startsWith('0x')) {
      try {
        const hexString = statement.substring(2);
        const paddedHexString = hexString.length % 2 !== 0 ? '0' + hexString : hexString;
        return Buffer.from(paddedHexString, 'hex').toString('utf8');
      } catch (error) {
        console.error('Failed to decode hex claimStatement:', error);
        return statement;
      }
    }

    return statement;
  }
}
