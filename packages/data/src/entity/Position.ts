import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  Unique,
} from "typeorm";
import { Transaction } from "./Transaction";
import { NUMERIC_PRECISION } from "../util/dbUtil";
// Read contractIds (chainId:address) from foilconfig.json ?

@Entity()
@Unique(["contractId", "nftId"])
export class Position {
  @OneToMany(() => Transaction, (transaction) => transaction.position)
  transactions: Transaction[];

  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column()
  contractId: string;

  @Column()
  nftId: number;

  @Column({ type: "numeric", precision: NUMERIC_PRECISION, scale: 0 })
  baseToken: string; // vGas tokenamount 0

  @Column({ type: "numeric", precision: NUMERIC_PRECISION, scale: 0 })
  quoteToken: string; // vETH tokenamount 1

  @Column({ type: "numeric", precision: NUMERIC_PRECISION, scale: 0 })
  collateral: string; // ETH  needs to be added

  @Column()
  profitLoss: number; // ETH  will calculate off chain, start at 0

  @Column()
  isLP: boolean; // true for event name

  @Column()
  highPrice: number; // still need to add to event

  @Column()
  lowPrice: number; // still need to add to event

  @Column()
  unclaimedFees: number; // ETH  start at 0
}
