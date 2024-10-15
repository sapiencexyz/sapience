import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  Unique,
} from "typeorm";
import { Market } from "./Market";
import { IndexPrice } from "./IndexPrice";
import { Position } from "./Position";
import { NUMERIC_PRECISION } from "../constants";
import { EpochParams } from "./EpochParams";

@Entity()
@Unique(["market", "epochId"])
export class Epoch {
  @ManyToOne(() => Market, (market) => market.epochs)
  market: Market;

  @OneToMany(() => Position, (position) => position.epoch)
  positions: Position[];

  @OneToMany(() => IndexPrice, (price) => price.epoch)
  indexPrices: IndexPrice[];

  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column()
  epochId: number;

  @Column()
  startTimestamp: number;

  @Column()
  endTimestamp: number;

  @Column({
    type: "numeric",
    precision: NUMERIC_PRECISION,
    scale: 0,
    nullable: true,
  })
  startingSqrtPriceX96: string | null;

  @Column(() => EpochParams)
  epochParams: EpochParams;

  @Column({
    type: "numeric",
    precision: NUMERIC_PRECISION,
    scale: 0,
    nullable: true,
  })
  settlementPriceD18: string | null;

  @Column({
    type: "boolean",
    nullable: true,
  })
  settled: boolean | null;
}
