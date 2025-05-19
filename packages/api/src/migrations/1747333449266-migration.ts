import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1747333449266 implements MigrationInterface {
  name = 'Migration1747333449266';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "cache_candle" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "candleType" character varying NOT NULL, "interval" integer NOT NULL, "trailingAvgTime" integer, "resourceSlug" character varying, "marketIdx" integer, "timestamp" integer NOT NULL, "open" character varying NOT NULL, "high" character varying NOT NULL, "low" character varying NOT NULL, "close" character varying NOT NULL, "endTimestamp" integer NOT NULL, "lastUpdatedTimestamp" integer NOT NULL, "sumUsed" numeric(78,0), "sumFeePaid" numeric(78,0), "trailingStartTimestamp" integer, "address" character varying, "chainId" integer, "marketId" integer, CONSTRAINT "UQ_60da794228fdbf7a92bc9fe57ad" UNIQUE ("candleType", "interval", "timestamp", "resourceSlug", "marketIdx", "trailingAvgTime"), CONSTRAINT "PK_7cccb7fd4c9f01146f390945d47" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b566d110c5729686ad4505a492" ON "cache_candle" ("candleType") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f5454dd794058f6ea2a9dd8e5f" ON "cache_candle" ("interval") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8a3905657db0bc8cac1e561280" ON "cache_candle" ("trailingAvgTime") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_18b0607b3120ec8c19f4bda502" ON "cache_candle" ("resourceSlug") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_beb912ef7d1246b726a6653ead" ON "cache_candle" ("marketIdx") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_669fbaca35ec75202012edcbed" ON "cache_candle" ("timestamp") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2ff6d3f51dade50ce5c1426303" ON "cache_candle" ("address") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_116e57f9f620b605a2f6194c0b" ON "cache_candle" ("chainId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4d21c04139a79adbf94f86405a" ON "cache_candle" ("marketId") `
    );
    await queryRunner.query(
      `CREATE TABLE "cache_param" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "paramName" character varying NOT NULL, "paramValueNumber" numeric(78,0) NOT NULL, CONSTRAINT "UQ_aed649af408ded722f22e882314" UNIQUE ("paramName"), CONSTRAINT "PK_b54cfc9bf8c8a86647ef9d05bd4" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_aed649af408ded722f22e88231" ON "cache_param" ("paramName") `
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_aed649af408ded722f22e88231"`
    );
    await queryRunner.query(`DROP TABLE "cache_param"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4d21c04139a79adbf94f86405a"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_116e57f9f620b605a2f6194c0b"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2ff6d3f51dade50ce5c1426303"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_669fbaca35ec75202012edcbed"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_beb912ef7d1246b726a6653ead"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_18b0607b3120ec8c19f4bda502"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8a3905657db0bc8cac1e561280"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f5454dd794058f6ea2a9dd8e5f"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b566d110c5729686ad4505a492"`
    );
    await queryRunner.query(`DROP TABLE "cache_candle"`);
  }
}
