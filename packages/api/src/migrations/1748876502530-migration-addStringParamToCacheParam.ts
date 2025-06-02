import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddStringParamToCacheParam1748876502530 implements MigrationInterface {
    name = 'AddStringParamToCacheParam1748876502530'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumn(
            'cache_param',
            new TableColumn({
              name: 'paramValueString',
              type: 'text',
              isNullable: true,
            })
          );
      
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn('cache_param', 'paramValueString');
    }

}
