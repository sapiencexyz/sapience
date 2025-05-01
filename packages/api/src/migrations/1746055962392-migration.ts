import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1746055962392 implements MigrationInterface {
    name = 'Migration1746055962392'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "market_group" ADD "initializationNonce" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "market_group" DROP COLUMN "initializationNonce"`);
    }

}
