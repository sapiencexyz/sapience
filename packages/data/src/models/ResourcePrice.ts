import { NUMERIC_PRECISION } from "../constants";
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
export class ResourcePrice {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Market, (market) => market.resourcePrices)
  market: Market;

  @Column({ type: "bigint" })
  blockNumber: string;

  @Column({ type: "bigint" })
  timestamp: string;

  @Column({ type: "numeric", precision: NUMERIC_PRECISION, scale: 0 })
  value: string;
}
