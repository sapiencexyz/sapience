import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCollateralDecimals1712698000000 implements MigrationInterface {
  name = 'AddCollateralDecimals1712698000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if the column already exists
    const hasColumn = await queryRunner.hasColumn(
      'market',
      'collateralDecimals'
    );

    if (!hasColumn) {
      console.log('Adding collateralDecimals column to market table');
      await queryRunner.query(
        `ALTER TABLE "market" ADD "collateralDecimals" integer NULL`
      );
    } else {
      console.log('collateralDecimals column already exists in market table');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn(
      'market',
      'collateralDecimals'
    );

    if (hasColumn) {
      console.log('Removing collateralDecimals column from market table');
      await queryRunner.query(
        `ALTER TABLE "market" DROP COLUMN "collateralDecimals"`
      );
    }
  }
}
