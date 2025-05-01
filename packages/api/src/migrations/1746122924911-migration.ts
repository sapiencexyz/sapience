import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1746122924911 implements MigrationInterface {
    name = 'Migration1746122924911'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "market_group" ALTER COLUMN "address" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "market_group" ALTER COLUMN "address" SET NOT NULL`);
    }
}
