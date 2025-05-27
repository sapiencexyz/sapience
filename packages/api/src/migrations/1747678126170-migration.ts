import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1747678126170 implements MigrationInterface {
  name = 'Migration1747678126170';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "market" ADD "rules" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "market" DROP COLUMN "rules"`);
  }
}
