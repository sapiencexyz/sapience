import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1742424541642 implements MigrationInterface {
  name = 'Migration1742424541642';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "market" ADD "isCumulative" boolean NOT NULL DEFAULT false`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "market" DROP COLUMN "isCumulative"`);
  }
}
