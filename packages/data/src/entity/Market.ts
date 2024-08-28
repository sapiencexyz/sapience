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
  
@Entity()
@Unique(["address", "chainId"])
export class Market {
  @OneToMany(() => Epoch, (epoch) => epoch.market)
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
}
