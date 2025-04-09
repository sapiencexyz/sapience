import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1744230317914 implements MigrationInterface {
  name = 'Migration1744230317914';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "market" DROP COLUMN "collateralDecimals"`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "market" ADD "collateralDecimals" integer`
    );
  }
}
