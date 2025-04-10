import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQuestionToEpoch1743797720926 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "epoch" ADD "question" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "epoch" DROP COLUMN "question"`);
  }
}
