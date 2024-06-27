import { Entity, PrimaryGeneratedColumn, Column, AfterInsert, AfterRemove, AfterUpdate, CreateDateColumn, OneToOne, JoinColumn,  } from 'typeorm';
import { Log } from 'viem';
import { Transaction } from './Transaction'
// Read contractIds (chainId:address) from foilconfig.json ?
// Add timestamp if the ORM doesn't do it automatically

@Entity()
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
