import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1748528252663 implements MigrationInterface {
    name = 'Migration1748528252663'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`TRUNCATE TABLE "cache_candle" RESTART IDENTITY`);
        await queryRunner.query(`TRUNCATE TABLE "cache_param" RESTART IDENTITY`);
      }
    
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      public async down(queryRunner: QueryRunner): Promise<void> {}
    
}
