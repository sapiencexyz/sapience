import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1745101065970 implements MigrationInterface {
  name = 'Migration1745101065970';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "market_group" ADD "collateralSymbol" character varying`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "market_group" DROP COLUMN "collateralSymbol"`
    );
  }
}
