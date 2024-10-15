import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
  OneToMany,
} from "typeorm";
import { Epoch } from "./Epoch";
import { ResourcePrice } from "./ResourcePrice";
import { EpochParams } from "./EpochParams";
import { Event } from "./Event";

@Entity()
@Unique(["address", "chainId"])
export class Market {
  @OneToMany(() => Epoch, (epoch) => epoch.market, {
    cascade: true,
  })
  epochs: Epoch[];

  @OneToMany(() => ResourcePrice, (price) => price.market)
  resourcePrices: ResourcePrice[];

  @OneToMany(() => Event, (event) => event.market)
  events: Event[];

  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column()
  address: string;

  @Column()
  chainId: number;

  @Column()
  deployTimestamp: number;

  @Column()
  deployTxnBlockNumber: number;

  @Column({ type: "varchar", nullable: true })
  owner: string | null;

  @Column({ type: "varchar", nullable: true })
  collateralAsset: string | null;

  @Column(() => EpochParams)
  epochParams: EpochParams;

  @Column()
  public: boolean;

  @Column({ type: "varchar", nullable: true })
  name: string | null;
}
