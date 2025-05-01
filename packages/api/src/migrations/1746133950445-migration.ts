import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1746133950445 implements MigrationInterface {
  name = 'Migration1746133950445';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "market_group" ADD "minTradeSize" numeric(78,0)`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "market_group" DROP COLUMN "minTradeSize"`
    );
  }
}
