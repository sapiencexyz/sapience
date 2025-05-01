import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1746058665505 implements MigrationInterface {
    name = 'Migration1746058665505'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "market" DROP CONSTRAINT "FK_02755ce1b56a981eef76c0b59b4"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_02755ce1b56a981eef76c0b59b"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f89ec06faf22da268399ae6a9b"`);
        await queryRunner.query(`ALTER TABLE "market" DROP CONSTRAINT "UQ_6e25995aba1162dc315f8214ee7"`);
        await queryRunner.query(`ALTER TABLE "market_group" ADD "factoryAddress" character varying`);
        await queryRunner.query(`ALTER TABLE "position" DROP CONSTRAINT "FK_0ad1a3735077091c74287ffc7ca"`);
        await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS "market_id_seq" OWNED BY "market"."id"`);
        await queryRunner.query(`ALTER TABLE "market" ALTER COLUMN "id" SET DEFAULT nextval('"market_id_seq"')`);
        await queryRunner.query(`ALTER TABLE "market" ALTER COLUMN "id" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "event" DROP CONSTRAINT "FK_be2327bfd127f45a55856b4c9de"`);
        await queryRunner.query(`ALTER TABLE "market" DROP CONSTRAINT "FK_bf8c48db94805b3077cfe30fa6c"`);
        await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS "market_group_id_seq" OWNED BY "market_group"."id"`);
        await queryRunner.query(`ALTER TABLE "market_group" ALTER COLUMN "id" SET DEFAULT nextval('"market_group_id_seq"')`);
        await queryRunner.query(`ALTER TABLE "market_group" ALTER COLUMN "id" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "market" ADD CONSTRAINT "FK_bf8c48db94805b3077cfe30fa6c" FOREIGN KEY ("marketGroupId") REFERENCES "market_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "event" ADD CONSTRAINT "FK_be2327bfd127f45a55856b4c9de" FOREIGN KEY ("marketGroupId") REFERENCES "market_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "position" ADD CONSTRAINT "FK_0ad1a3735077091c74287ffc7ca" FOREIGN KEY ("marketId") REFERENCES "market"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "position" DROP CONSTRAINT "FK_0ad1a3735077091c74287ffc7ca"`);
        await queryRunner.query(`ALTER TABLE "event" DROP CONSTRAINT "FK_be2327bfd127f45a55856b4c9de"`);
        await queryRunner.query(`ALTER TABLE "market" DROP CONSTRAINT "FK_bf8c48db94805b3077cfe30fa6c"`);
        await queryRunner.query(`ALTER TABLE "market_group" ALTER COLUMN "id" SET DEFAULT nextval('market_id_seq')`);
        await queryRunner.query(`ALTER TABLE "market_group" ALTER COLUMN "id" DROP DEFAULT`);
        await queryRunner.query(`DROP SEQUENCE "market_group_id_seq"`);
        await queryRunner.query(`ALTER TABLE "market" ADD CONSTRAINT "FK_bf8c48db94805b3077cfe30fa6c" FOREIGN KEY ("marketGroupId") REFERENCES "market_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "event" ADD CONSTRAINT "FK_be2327bfd127f45a55856b4c9de" FOREIGN KEY ("marketGroupId") REFERENCES "market_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "market" ALTER COLUMN "id" SET DEFAULT nextval('epoch_id_seq')`);
        await queryRunner.query(`ALTER TABLE "market" ALTER COLUMN "id" DROP DEFAULT`);
        await queryRunner.query(`DROP SEQUENCE "market_id_seq"`);
        await queryRunner.query(`ALTER TABLE "position" ADD CONSTRAINT "FK_0ad1a3735077091c74287ffc7ca" FOREIGN KEY ("marketId") REFERENCES "market"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "market_group" DROP COLUMN "factoryAddress"`);
        await queryRunner.query(`ALTER TABLE "market" ADD CONSTRAINT "UQ_6e25995aba1162dc315f8214ee7" UNIQUE ("marketId", "marketGroupId")`);
        await queryRunner.query(`CREATE INDEX "IDX_f89ec06faf22da268399ae6a9b" ON "market" ("marketId") `);
        await queryRunner.query(`CREATE INDEX "IDX_02755ce1b56a981eef76c0b59b" ON "market" ("marketGroupId") `);
        await queryRunner.query(`ALTER TABLE "market" ADD CONSTRAINT "FK_02755ce1b56a981eef76c0b59b4" FOREIGN KEY ("marketGroupId") REFERENCES "market_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
