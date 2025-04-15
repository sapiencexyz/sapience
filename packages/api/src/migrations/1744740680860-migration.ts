import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1744740680860 implements MigrationInterface {
  name = 'Migration1744740680860';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the foreign key constraints
    await queryRunner.query(
      `ALTER TABLE "market" DROP CONSTRAINT "FK_9e81566b3fb87af12ce026d175c"`
    );
    await queryRunner.query(
      `ALTER TABLE "market" DROP CONSTRAINT "FK_4a367c74efb03d5ef457d780f8e"`
    );
    await queryRunner.query(
      `ALTER TABLE "event" DROP CONSTRAINT "FK_aa29b0dd2af5ee4ca69fabf546f"`
    );
    await queryRunner.query(
      `ALTER TABLE "position" DROP CONSTRAINT "FK_f4b5c7e8a79b394e39676c52878"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_33f985ce349688238dfeb8560e"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_58232d6050e212b4a0f7eb02da"`
    );
    await queryRunner.query(
      `ALTER TABLE "market" DROP CONSTRAINT "UQ_035a4c41b4b11c5726c54d68ec4"`
    );
    await queryRunner.query(
      `ALTER TABLE "event" DROP CONSTRAINT "UQ_d099d527f26583faa4f1ace4d08"`
    );
    await queryRunner.query(
      `ALTER TABLE "position" DROP CONSTRAINT "UQ_6e96ed27f3878b2e461f10d0199"`
    );

    // Rename the columns
    await queryRunner.query(
      `ALTER TABLE "event" RENAME COLUMN "marketId" TO "marketGroupId"`
    );
    await queryRunner.query(
      `ALTER TABLE "position" RENAME COLUMN "epochId" TO "marketId"`
    );

    // Rename the tables
    await queryRunner.query(`ALTER TABLE "market" RENAME TO "market_group"`);
    await queryRunner.query(`ALTER TABLE "epoch" RENAME TO "market"`);
    await queryRunner.query(
      `ALTER TABLE "market" RENAME COLUMN "marketId" TO "marketGroupId"`
    );
    await queryRunner.query(
      `ALTER TABLE "market" RENAME COLUMN "epochId" TO "marketId"`
    );

    // Create the new indexes
    await queryRunner.query(
      `CREATE INDEX "IDX_4840554118be25e79d9f2cd8c1" ON "market_group" ("address") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_da0b448860ebff62a08819b65a" ON "market_group" ("chainId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bf8c48db94805b3077cfe30fa6" ON "market" ("marketGroupId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b8cf3f5b97db288fd5252e1cb0" ON "market" ("marketId") `
    );

    // Create the new unique and foreign key constraints
    await queryRunner.query(
      `ALTER TABLE "market_group" ADD CONSTRAINT "UQ_b1a3dbc95ad359ef11bfb72b307" UNIQUE ("address", "chainId")`
    );

    await queryRunner.query(
      `ALTER TABLE "market" ADD CONSTRAINT "UQ_0a0e1fcc7164cb26a957c806314" UNIQUE ("marketGroupId", "marketId")`
    );
    await queryRunner.query(
      `ALTER TABLE "event" ADD CONSTRAINT "UQ_784b6bb8194a5c7b41a7be2ffa5" UNIQUE ("transactionHash", "marketGroupId", "blockNumber", "logIndex")`
    );
    await queryRunner.query(
      `ALTER TABLE "position" ADD CONSTRAINT "UQ_40d3e2f973bc69ff8e8d0f89dde" UNIQUE ("positionId", "marketId")`
    );
    await queryRunner.query(
      `ALTER TABLE "market" ADD CONSTRAINT "FK_bf8c48db94805b3077cfe30fa6c" FOREIGN KEY ("marketGroupId") REFERENCES "market_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "market_group" ADD CONSTRAINT "FK_78409a3738729038b76742291f0" FOREIGN KEY ("resourceId") REFERENCES "resource"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "market_group" ADD CONSTRAINT "FK_f092ffcae41efef68cdc30bbd89" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "event" ADD CONSTRAINT "FK_be2327bfd127f45a55856b4c9de" FOREIGN KEY ("marketGroupId") REFERENCES "market_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "position" ADD CONSTRAINT "FK_0ad1a3735077091c74287ffc7ca" FOREIGN KEY ("marketId") REFERENCES "market"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "position" DROP CONSTRAINT "FK_0ad1a3735077091c74287ffc7ca"`
    );
    await queryRunner.query(
      `ALTER TABLE "event" DROP CONSTRAINT "FK_be2327bfd127f45a55856b4c9de"`
    );
    await queryRunner.query(
      `ALTER TABLE "market_group" DROP CONSTRAINT "FK_f092ffcae41efef68cdc30bbd89"`
    );
    await queryRunner.query(
      `ALTER TABLE "market_group" DROP CONSTRAINT "FK_78409a3738729038b76742291f0"`
    );
    await queryRunner.query(
      `ALTER TABLE "market" DROP CONSTRAINT "FK_bf8c48db94805b3077cfe30fa6c"`
    );
    await queryRunner.query(
      `ALTER TABLE "position" DROP CONSTRAINT "UQ_40d3e2f973bc69ff8e8d0f89dde"`
    );
    await queryRunner.query(
      `ALTER TABLE "event" DROP CONSTRAINT "UQ_784b6bb8194a5c7b41a7be2ffa5"`
    );
    await queryRunner.query(
      `ALTER TABLE "market" DROP CONSTRAINT "UQ_0a0e1fcc7164cb26a957c806314"`
    );

    await queryRunner.query(
      `ALTER TABLE "market_group" DROP CONSTRAINT "UQ_b1a3dbc95ad359ef11bfb72b307"`
    );

    await queryRunner.query(
      `DROP INDEX "public"."IDX_b8cf3f5b97db288fd5252e1cb0"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bf8c48db94805b3077cfe30fa6"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_da0b448860ebff62a08819b65a"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4840554118be25e79d9f2cd8c1"`
    );

    await queryRunner.query(`ALTER TABLE "market" RENAME TO "epoch"`);
    await queryRunner.query(`ALTER TABLE "market_group" RENAME TO "market"`);

    await queryRunner.query(
      `ALTER TABLE "position" RENAME COLUMN "marketId" TO "epochId"`
    );
    await queryRunner.query(
      `ALTER TABLE "event" RENAME COLUMN "marketGroupId" TO "marketId"`
    );
    await queryRunner.query(
      `ALTER TABLE "position" ADD CONSTRAINT "UQ_6e96ed27f3878b2e461f10d0199" UNIQUE ("positionId", "epochId")`
    );
    await queryRunner.query(
      `ALTER TABLE "event" ADD CONSTRAINT "UQ_d099d527f26583faa4f1ace4d08" UNIQUE ("blockNumber", "transactionHash", "logIndex", "marketId")`
    );
    await queryRunner.query(
      `ALTER TABLE "market" ADD CONSTRAINT "UQ_035a4c41b4b11c5726c54d68ec4" UNIQUE ("address", "chainId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_58232d6050e212b4a0f7eb02da" ON "market" ("address") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_33f985ce349688238dfeb8560e" ON "market" ("chainId") `
    );
    await queryRunner.query(
      `ALTER TABLE "position" ADD CONSTRAINT "FK_f4b5c7e8a79b394e39676c52878" FOREIGN KEY ("epochId") REFERENCES "epoch"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "event" ADD CONSTRAINT "FK_aa29b0dd2af5ee4ca69fabf546f" FOREIGN KEY ("marketId") REFERENCES "market"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "market" ADD CONSTRAINT "FK_4a367c74efb03d5ef457d780f8e" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "market" ADD CONSTRAINT "FK_9e81566b3fb87af12ce026d175c" FOREIGN KEY ("resourceId") REFERENCES "resource"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
  }
}
