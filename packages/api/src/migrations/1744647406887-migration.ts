import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1744647406887 implements MigrationInterface {
  name = 'Migration1744647406887';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "market" ADD "baseTokenName" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "market" ADD "quoteTokenName" character varying`
    );
    await queryRunner.query(`ALTER TABLE "market" ADD "optionNames" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "market" DROP COLUMN "optionNames"`);
    await queryRunner.query(
      `ALTER TABLE "market" DROP COLUMN "quoteTokenName"`
    );
    await queryRunner.query(`ALTER TABLE "market" DROP COLUMN "baseTokenName"`);
  }
}
