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
import { Event } from "./Event";
import { Position } from "./Position";
import { NUMERIC_PRECISION } from "../constants";

@Entity()
@Unique(["market", "epochId"])
export class Epoch {
  @ManyToOne(() => Market, (market) => market.epochs)
  market: Market;

  @OneToMany(() => Event, (event) => event.epoch)
  events: Event[];

  @OneToMany(() => Position, (position) => position.epoch)
  positions: Position[];

  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column()
  epochId: number;

  @Column("varchar", { length: NUMERIC_PRECISION, nullable: true })
  startTimestamp: string | null;

  @Column("varchar", { length: NUMERIC_PRECISION, nullable: true })
  endTimestamp: string | null;

  @Column({
    type: "numeric",
    precision: NUMERIC_PRECISION,
    scale: 0,
    nullable: true,
  })
  startingSqrtPriceX96: string | null;
}
