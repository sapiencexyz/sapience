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
export class CollateralTransfer {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Market, (market) => market.collateralTransfers)
  market: Market;

  @Column({ type: "integer" })
  timestamp: number;

  @Column({ type: "varchar" })
  owner: string;

  @Column({ type: "numeric", precision: NUMERIC_PRECISION, scale: 0 })
  collateral: string; // i.e. wstETH
}
