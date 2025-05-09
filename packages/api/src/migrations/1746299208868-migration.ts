import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1746299208868 implements MigrationInterface {
  name = 'Migration1746299208868';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "crypto_prices" ("id" SERIAL NOT NULL, "ticker" text, "price" double precision NOT NULL, "timestamp" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_89cb6d0cae37e526edadf4ce7c2" PRIMARY KEY ("id"))`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "crypto_prices"`);
  }
}
