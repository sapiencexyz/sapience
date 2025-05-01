import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1746057361010 implements MigrationInterface {
  name = 'Migration1746057361010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "market_group" DROP COLUMN "optionNames"`
    );
    await queryRunner.query(`ALTER TABLE "market" ADD "optionName" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "market" DROP COLUMN "optionName"`);
    await queryRunner.query(
      `ALTER TABLE "market_group" ADD "optionNames" text`
    );
  }
}
