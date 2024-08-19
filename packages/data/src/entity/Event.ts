import { Entity, PrimaryGeneratedColumn, Column, AfterInsert, AfterRemove, AfterUpdate, CreateDateColumn, OneToOne, JoinColumn, Unique,  } from 'typeorm';
import { Log } from 'viem';
import { Transaction } from './Transaction'

@Entity()
@Unique(['contractId', 'blockNumber', 'logIndex'])  // Add this line
export class Event {
    @OneToOne(() => Transaction, (transaction) => transaction.event, { cascade: true })
    @JoinColumn()
    transaction: Transaction;

    @PrimaryGeneratedColumn()
    id: number;

    @CreateDateColumn()
    createdAt: Date;

    @Column()
    contractId: string;

    @Column()
    blockNumber: number;

    @Column()
    logIndex: number;

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
