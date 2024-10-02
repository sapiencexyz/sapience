import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
  OneToMany,
} from "typeorm";
import { Epoch } from "./Epoch";
import { Price } from "./Price";
import { EpochParams } from "./EpochParams";

@Entity()
@Unique(["address", "chainId"])
export class Market {
  @OneToMany(() => Epoch, (epoch) => epoch.market, {
    cascade: true,
  })
  epochs: Epoch[];

  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column()
  address: string;

  @Column()
  chainId: number;

  @Column({ type: "varchar", nullable: true })
  owner: string | null;

  @Column({ type: "varchar", nullable: true })
  collateralAsset: string | null;

  @Column(() => EpochParams)
  epochParams: EpochParams;
}
