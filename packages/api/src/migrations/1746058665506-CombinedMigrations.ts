import { MigrationInterface, QueryRunner } from 'typeorm';

export class CombinedMigrations1746058665506 implements MigrationInterface {
  name = 'CombinedMigrations1746058665506';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "market_group" ADD "initializationNonce" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "market_group" DROP COLUMN "optionNames"`
    );
    await queryRunner.query(`ALTER TABLE "market" ADD "optionName" text`);
    await queryRunner.query(
      `ALTER TABLE "market_group" ADD "factoryAddress" character varying`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "market_group" DROP COLUMN "factoryAddress"`
    );
    await queryRunner.query(`ALTER TABLE "market" DROP COLUMN "optionName"`);
    await queryRunner.query(
      `ALTER TABLE "market_group" ADD "optionNames" text`
    );
    await queryRunner.query(
      `ALTER TABLE "market_group" DROP COLUMN "initializationNonce"`
    );
  }
} 