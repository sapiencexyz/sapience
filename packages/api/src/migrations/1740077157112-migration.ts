import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1740077157112 implements MigrationInterface {
  name = 'Migration1740077157112';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "market" DROP COLUMN "public"`);
    await queryRunner.query(
      `ALTER TABLE "epoch" ADD "public" boolean NOT NULL DEFAULT true`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "epoch" DROP COLUMN "public"`);
    await queryRunner.query(
      `ALTER TABLE "market" ADD "public" boolean NOT NULL DEFAULT false`
    );
  }
}
