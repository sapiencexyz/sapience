import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from "typeorm";
import { Market } from "./Market";
import { ResourcePrice } from "./ResourcePrice";

@Entity()
export class Resource {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: "varchar", unique: true })
  name: string;

  @Column({ type: "varchar", unique: true })
  slug: string;

  @OneToMany(
    () => Market,
    (market) => market.resource,
  )
  markets: Market[];

  @OneToMany(
    () => ResourcePrice,
    (resourcePrice) => resourcePrice.resource,
  )
  resourcePrices: ResourcePrice[];
}
