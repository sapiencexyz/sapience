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
import { NUMERIC_PRECISION } from "../util/dbUtil";

class EpochParams {
  @Column("int", { nullable: true })
  baseAssetMinPriceTick: number | null;

  @Column("int", { nullable: true })
  baseAssetMaxPriceTick: number | null;

  @Column("int", { nullable: true })
  feeRate: number | null;

  @Column({
    type: "numeric",
    precision: NUMERIC_PRECISION,
    scale: 0,
    nullable: true,
  })
  assertionLiveness: string | null;

  @Column("varchar", { nullable: true })
  bondCurrency: string | null;

  @Column({
    type: "numeric",
    precision: NUMERIC_PRECISION,
    scale: 0,
    nullable: true,
  })
  bondAmount: string | null;

  @Column("varchar", { nullable: true })
  priceUnit: string | null;
}

@Entity()
@Unique(["address", "chainId"])
export class Market {
  @OneToMany(() => Epoch, (epoch) => epoch.market, {
    cascade: true,
  })
  epochs: Epoch[];

  @OneToMany(() => Price, (price) => price.market)
  prices: Price[];

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
  uniswapPositionManager: string | null;

  @Column({ type: "varchar", nullable: true })
  uniswapSwapRouter: string | null;

  @Column({ type: "varchar", nullable: true })
  optimisticOracleV3: string | null;

  @Column({ type: "varchar", nullable: true })
  collateralAsset: string | null;

  @Column(() => EpochParams)
  epochParams: EpochParams;
}
