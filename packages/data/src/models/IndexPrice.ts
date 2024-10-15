import { NUMERIC_PRECISION } from "../constants";
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
  ManyToOne,
} from "typeorm";
import { Epoch } from "./Epoch";

@Entity()
@Unique(["epoch", "timestamp"])
export class IndexPrice {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Epoch, (epoch) => epoch.indexPrices)
  epoch: Epoch;

  @Column({ type: "bigint" })
  timestamp: string;

  @Column({ type: "numeric", precision: NUMERIC_PRECISION, scale: 0 })
  value: string;
}
