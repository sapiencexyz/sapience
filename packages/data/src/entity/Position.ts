import { Entity, PrimaryGeneratedColumn, Column, AfterInsert, AfterRemove, AfterUpdate, CreateDateColumn, OneToMany, ManyToOne } from 'typeorm';
import { Transaction } from './Transaction';
// Read contractIds (chainId:address) from foilconfig.json ?

@Entity()
export class Position {
    @OneToMany(() => Transaction, (transaction) => transaction.position)
    transactions: Transaction[];
    
    @PrimaryGeneratedColumn()
    id: number;

    @CreateDateColumn()
    createdAt: Date;

    @Column()
    nftId: number;

    @Column()
    baseToken: number; // vGas

    @Column()
    quoteToken: number; // vETH

    @Column()
    collateral: number;  // ETH

    @Column()
    profitLoss: number; // ETH

    @Column()
    isLP: boolean;

    @Column()
    unclaimedFees: number; // ETH
}