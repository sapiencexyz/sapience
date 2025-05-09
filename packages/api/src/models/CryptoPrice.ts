import {
  Entity,
  Column,
  UpdateDateColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('crypto_prices')
export class CryptoPrice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text', nullable: true })
  ticker: string | null;

  @Column('float')
  price: number;

  @UpdateDateColumn()
  timestamp: Date;
}
