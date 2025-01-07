import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
  OneToMany,
  ManyToOne,
} from "typeorm";
import { Epoch } from "./Epoch";
import { MarketParams } from "./MarketParams";
import { Event } from "./Event";
import { Resource } from "./Resource";

@Entity()
@Unique(["address", "chainId"])
export class Market {
  @OneToMany(() => Epoch, (epoch) => epoch.market, {
    cascade: true,
  })
  epochs: Epoch[];

  @OneToMany(() => Event, (event) => event.market)
  events: Event[];

  @ManyToOne(() => Resource, (resource) => resource.markets)
  resource: Resource;

  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: "varchar" })
  address: string;

  @Column({ type: "integer" })
  chainId: number;

  @Column({ type: "integer", nullable: true })
  deployTimestamp: number | null;

  @Column({ type: "integer", nullable: true })
  deployTxnBlockNumber: number | null;

  @Column({ type: "varchar", nullable: true })
  owner: string | null;

  @Column({ type: "varchar", nullable: true })
  collateralAsset: string | null;

  @Column(() => MarketParams)
  marketParams: MarketParams;

  @Column({ type: "boolean", default: false })
  public: boolean;

  @Column({ type: "varchar", nullable: true })
  name: string | null;
}