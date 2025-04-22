import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1745345720815 implements MigrationInterface {
  name = 'Migration1745345720815';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "market" ADD "poolAddress" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "market" DROP COLUMN "poolAddress"`);
  }
}
