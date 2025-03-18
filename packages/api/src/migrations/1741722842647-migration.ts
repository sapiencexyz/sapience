import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1741722842647 implements MigrationInterface {
    name = 'Migration1741722842647'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX "IDX_02755ce1b56a981eef76c0b59b" ON "epoch" ("marketId") `);
        await queryRunner.query(`CREATE INDEX "IDX_f89ec06faf22da268399ae6a9b" ON "epoch" ("epochId") `);
        await queryRunner.query(`CREATE INDEX "IDX_187fa56af532560ce204719ea3" ON "resource_price" ("resourceId") `);
        await queryRunner.query(`CREATE INDEX "IDX_5bbe200849d138539d19b7caa6" ON "resource_price" ("blockNumber") `);
        await queryRunner.query(`CREATE INDEX "IDX_a369700ab879af9ef6061c6dbe" ON "resource_price" ("timestamp") `);
        await queryRunner.query(`CREATE INDEX "IDX_82453de75cd894e19c42844e70" ON "resource" ("slug") `);
        await queryRunner.query(`CREATE INDEX "IDX_58232d6050e212b4a0f7eb02da" ON "market" ("address") `);
        await queryRunner.query(`CREATE INDEX "IDX_33f985ce349688238dfeb8560e" ON "market" ("chainId") `);
        await queryRunner.query(`CREATE INDEX "IDX_5430e2d7fe1df2bcada2c12deb" ON "event" ("blockNumber") `);
        await queryRunner.query(`CREATE INDEX "IDX_2c15918ff289396205521c5f3c" ON "event" ("timestamp") `);
        await queryRunner.query(`CREATE INDEX "IDX_a9346cdd1ea1e53a6b87e409ad" ON "market_price" ("timestamp") `);
        await queryRunner.query(`CREATE INDEX "IDX_1ebf6f07652ca11d9f4618b64a" ON "collateral_transfer" ("transactionHash") `);
        await queryRunner.query(`CREATE INDEX "IDX_927edd2b828777f0052366195e" ON "position" ("positionId") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_927edd2b828777f0052366195e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1ebf6f07652ca11d9f4618b64a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a9346cdd1ea1e53a6b87e409ad"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2c15918ff289396205521c5f3c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5430e2d7fe1df2bcada2c12deb"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_33f985ce349688238dfeb8560e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_58232d6050e212b4a0f7eb02da"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_82453de75cd894e19c42844e70"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a369700ab879af9ef6061c6dbe"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5bbe200849d138539d19b7caa6"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_187fa56af532560ce204719ea3"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f89ec06faf22da268399ae6a9b"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_02755ce1b56a981eef76c0b59b"`);
    }

}
