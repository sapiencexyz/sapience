import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1744775423017 implements MigrationInterface {
    name = 'Migration1744775423017'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "market" ADD "collateralDecimals" integer`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "market" DROP COLUMN "collateralDecimals"`);
    }

}
