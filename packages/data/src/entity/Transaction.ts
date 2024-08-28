import { Entity, PrimaryGeneratedColumn, Column, AfterInsert, AfterRemove, AfterUpdate, CreateDateColumn, OneToMany, ManyToOne, OneToOne } from 'typeorm';
import { Event } from './Event'
import { Position } from './Position'

export enum TransactionType {
    BUY = 'buy',
    SELL = 'sell',
    ADD_LIQUIDITY = 'addLiquidity',
    REMOVE_LIQUIDITY = 'removeLiquidity',
    ADD_COLLATERAL = 'addCollateral',
    REMOVE_COLLATERAL = 'removeCollateral',
}
/**
/* Alternatively:
/* setBaseTokenAmount, with baseTokenAmountSet event
/* setQuoteTokenAmount, with quoteTokenAmountSet event
/* setLiquidityAmount, with liquidityAmountSet event
/* setCollateralAmount, with collateralAmountSet event
/* In this case, the event just emits the parameters and they're recorded verbatim.
**/

@Entity()
export class Transaction {
    @OneToOne(() => Event, (event) => event.transaction)
    event: Event;

    @ManyToOne(() => Position, (position) => position.transactions)
    position: Position;

    @PrimaryGeneratedColumn()
    id: number;

    @CreateDateColumn()
    createdAt: Date;

    @Column()
    nftId: number; // foreign key to NFT

    @Column({
        type: 'simple-enum',
        enum: TransactionType,
    })
    type: TransactionType;

    @Column()
    baseTokenAmount: number; // vGas

    @Column()
    quoteTokenAmount: number; // vETH

    @Column()
    collateral: number;  // ETH

    // AfterInsert AfterUpdate and AfterRemove to update the associated Position based on nftId
}