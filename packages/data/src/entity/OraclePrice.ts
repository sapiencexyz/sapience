import { Entity, PrimaryGeneratedColumn, Column, AfterInsert, AfterRemove, AfterUpdate,  } from 'typeorm';

@Entity()
export class OraclePrice {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    contractId: string;

    // Timestamp

    // Value
}
