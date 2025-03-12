import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1741790918671 implements MigrationInterface {
  name = 'Migration1741790918671';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "performance_cache" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "resourceSlug" character varying NOT NULL, "interval" character varying NOT NULL, "jsonSection" character varying NOT NULL, "storageVersion" character varying, "latestTimestamp" character varying NOT NULL, "storage" jsonb NOT NULL, CONSTRAINT "PK_93aab8268ebc22e5129c77cdc2d" PRIMARY KEY ("id"))`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "performance_cache"`);
  }
}
