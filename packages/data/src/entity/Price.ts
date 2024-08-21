import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";

@Entity()
export class Price {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column()
  contractId: string;

  @Column({ type: "bigint" })
  blockNumber: string;

  @Column({ type: "bigint" })
  timestamp: string;

  @Column({ type: "bigint" })
  value: string;
}
