import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1742404129058 implements MigrationInterface {
    name = 'Migration1742404129058'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "resource" ADD "cumulativeOn" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "resource" DROP COLUMN "cumulativeOn"`);
    }

}
