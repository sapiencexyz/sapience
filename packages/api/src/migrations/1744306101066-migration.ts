import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1744306101066 implements MigrationInterface {
  name = 'Migration1744306101066';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource" ADD "categoryId" integer`);
    await queryRunner.query(
      `ALTER TABLE "resource" ADD CONSTRAINT "FK_66faacb332a925bf732256594e5" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "resource" DROP CONSTRAINT "FK_66faacb332a925bf732256594e5"`
    );
    await queryRunner.query(`ALTER TABLE "resource" DROP COLUMN "categoryId"`);
  }
}
