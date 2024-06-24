import { Entity, PrimaryGeneratedColumn, Column, AfterInsert, AfterRemove, AfterUpdate,  } from 'typeorm';
import { Log } from 'viem';
// Read contractIds (chainId:address) from foilconfig.json ?
// Add timestamp if the ORM doesn't do it automatically

@Entity()
export class Event {
    // has_one Transaction

    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    contractId: string;

    @Column({ type: 'json' })
    logData!: Log;

    // All should fail without crashing
    @AfterInsert()
    afterInsert() {
        console.log(`Event inserted: ${this.id}`);
        // Upsert associated Position or Transaction
    }

    @AfterUpdate()
    afterUpdate() {
        console.log(`Event updated: ${this.id}`);
        // Upsert associated Position or Transaction
    }

    @AfterRemove()
    afterRemove() {
        console.log(`Event removed: ${this.id}`);
        // Delete associated Position or Transaction
    }
}

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
    // belongs_to Event
    // belongs_to Position

    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    nftId: number; // foreign key to NFT

    @Column({
        type: 'enum',
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

@Entity()
export class Position {
    // has_many Transaction
    @PrimaryGeneratedColumn()
    id: number;

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