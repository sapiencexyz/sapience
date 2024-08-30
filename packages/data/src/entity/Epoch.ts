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
}
