import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
  ManyToOne,
} from "typeorm";
import { Market } from "./Market";

@Entity()
@Unique(["market", "timestamp"])
export class Price {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Market, (market) => market.prices)
  market: Market;

  @Column({ type: "bigint" })
  blockNumber: string;

  @Column({ type: "bigint" })
  timestamp: string;

  @Column({ type: "bigint" })
  value: string;
}
