import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1744649532236 implements MigrationInterface {
    name = 'Migration1744649532236'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "resource" DROP CONSTRAINT "FK_66faacb332a925bf732256594e5"`);
        await queryRunner.query(`ALTER TABLE "market" RENAME COLUMN "question" TO "collateralDecimals"`);
        await queryRunner.query(`ALTER TABLE "resource" DROP COLUMN "categoryId"`);
        await queryRunner.query(`ALTER TABLE "market" DROP COLUMN "collateralDecimals"`);
        await queryRunner.query(`ALTER TABLE "market" ADD "collateralDecimals" integer`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "market" DROP COLUMN "collateralDecimals"`);
        await queryRunner.query(`ALTER TABLE "market" ADD "collateralDecimals" text`);
        await queryRunner.query(`ALTER TABLE "resource" ADD "categoryId" integer`);
        await queryRunner.query(`ALTER TABLE "market" RENAME COLUMN "collateralDecimals" TO "question"`);
        await queryRunner.query(`ALTER TABLE "resource" ADD CONSTRAINT "FK_66faacb332a925bf732256594e5" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
