import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class Price {
    @PrimaryGeneratedColumn()
    id: number;

    @CreateDateColumn()
    createdAt: Date;

    @Column()
    contractId: string;

    @Column()
    block: number;

    @Column()
    timestamp: number;

    @Column()
    value: number;
}