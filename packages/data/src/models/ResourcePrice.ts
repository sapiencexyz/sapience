import { NUMERIC_PRECISION } from "../constants";
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
  ManyToOne,
  AfterInsert,
  AfterUpdate,
} from "typeorm";
import { Market } from "./Market";
import { upsertIndexPriceFromResourcePrice } from "src/controllers/price";

@Entity()
@Unique(["market", "timestamp"])
export class ResourcePrice {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Market, (market) => market.resourcePrices)
  market: Market;

  @Column({ type: "integer" })
  blockNumber: number;

  @Column({ type: "integer" })
  timestamp: number;

  @Column({ type: "numeric", precision: NUMERIC_PRECISION, scale: 0 })
  value: string;

  @Column({ type: "numeric", precision: NUMERIC_PRECISION, scale: 0 })
  used: string;

  @AfterInsert()
  async afterInsert() {
    console.log("Resource price inserted for block: " + this.blockNumber);
    await upsertIndexPriceFromResourcePrice(this);
  }

  @AfterUpdate()
  async afterUpdate() {
    console.log(`Resource price updated: ${this.id}`);
    await upsertIndexPriceFromResourcePrice(this);
  }
}
