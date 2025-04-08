import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migrations1744128969991 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Delete epochs with null startTimestamp
    await queryRunner.query(
      `DELETE FROM "epoch" WHERE "startTimestamp" IS NULL`
    );

    // Delete markets with null vaultAddress
    await queryRunner.query(
      `DELETE FROM "market" WHERE "vaultAddress" IS NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Note: We cannot restore deleted rows in the down migration
    // as we don't have the original data
    console.log('Warning: Cannot restore deleted rows in down migration');
  }
}
