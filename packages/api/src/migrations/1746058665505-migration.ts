import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1746058665505 implements MigrationInterface {
  name = 'Migration1746058665505';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "market_group" ADD "factoryAddress" character varying`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "market_group" DROP COLUMN "factoryAddress"`
    );
  }
}
