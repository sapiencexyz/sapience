import { Column } from "typeorm";
import { NUMERIC_PRECISION } from "../constants";

export class MarketParams {
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
  claimStatement: string | null;

  @Column({ type: "varchar", nullable: true })
  uniswapPositionManager: string | null;

  @Column({ type: "varchar", nullable: true })
  uniswapSwapRouter: string | null;

  @Column({ type: "varchar", nullable: true })
  uniswapQuoter: string | null;

  @Column({ type: "varchar", nullable: true })
  optimisticOracleV3: string | null;
}
