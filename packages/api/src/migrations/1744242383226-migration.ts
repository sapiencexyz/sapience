import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1744242383226 implements MigrationInterface {
  name = 'Migration1744242383226';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "market" ADD "question" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "market" DROP COLUMN "question"`);
  }
}
