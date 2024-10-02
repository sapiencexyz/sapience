import { NUMERIC_PRECISION } from "../constants";
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
  OneToMany,
} from "typeorm";
import { Epoch } from "./Epoch";

@Entity()
@Unique(["market", "timestamp"])
export class Price {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => Epoch, (epoch) => epoch.price)
  epochs: Epoch[];

  @Column({ type: "bigint" })
  blockNumber: string;

  @Column({ type: "bigint" })
  timestamp: string;

  @Column({ type: "numeric", precision: NUMERIC_PRECISION, scale: 0 })
  value: string;
}
