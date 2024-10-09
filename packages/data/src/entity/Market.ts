import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
  OneToMany,
} from "typeorm";
import { Epoch } from "./Epoch";
import { IndexPrice } from "./IndexPrice";
import { EpochParams } from "./EpochParams";

@Entity()
@Unique(["address", "chainId"])
export class Market {
  @OneToMany(() => Epoch, (epoch) => epoch.market, {
    cascade: true,
  })
  epochs: Epoch[];

  @OneToMany(() => IndexPrice, (price) => price.market)
  prices: IndexPrice[];

  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column()
  address: string;

  @Column()
  chainId: number;

  @Column({ type: "bigint" })
  deployTimestamp: string;

  @Column({ type: "bigint" })
  deployTxnBlockNumber: string;

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
