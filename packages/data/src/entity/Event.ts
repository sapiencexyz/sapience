import { Entity, PrimaryGeneratedColumn, Column, AfterInsert, AfterRemove, AfterUpdate,  } from 'typeorm';
import { Log } from 'viem';
// Read contractIds (chainId:address) from foilconfig.json
// Event has many Positions, Transactions, and Prices

@Entity()
export class Event {
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
