import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1744057447617 implements MigrationInterface {
  name = 'Migration1744057447617';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "category" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "name" character varying NOT NULL, "slug" character varying NOT NULL, CONSTRAINT "UQ_23c05c292c439d77b0de816b500" UNIQUE ("name"), CONSTRAINT "UQ_cb73208f151aa71cdd78f662d70" UNIQUE ("slug"), CONSTRAINT "PK_9c4e4a89e3674fc9f382d733f03" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cb73208f151aa71cdd78f662d7" ON "category" ("slug") `
    );
    await queryRunner.query(`ALTER TABLE "market" ADD "categoryId" integer`);
    await queryRunner.query(
      `ALTER TABLE "market" ADD CONSTRAINT "FK_4a367c74efb03d5ef457d780f8e" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "market" DROP CONSTRAINT "FK_4a367c74efb03d5ef457d780f8e"`
    );
    await queryRunner.query(`ALTER TABLE "market" DROP COLUMN "categoryId"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cb73208f151aa71cdd78f662d7"`
    );
    await queryRunner.query(`DROP TABLE "category"`);
  }
}
