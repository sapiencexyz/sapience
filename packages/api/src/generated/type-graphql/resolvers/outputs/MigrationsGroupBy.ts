import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { MigrationsAvgAggregate } from "../outputs/MigrationsAvgAggregate";
import { MigrationsCountAggregate } from "../outputs/MigrationsCountAggregate";
import { MigrationsMaxAggregate } from "../outputs/MigrationsMaxAggregate";
import { MigrationsMinAggregate } from "../outputs/MigrationsMinAggregate";
import { MigrationsSumAggregate } from "../outputs/MigrationsSumAggregate";

@TypeGraphQL.ObjectType("MigrationsGroupBy", {})
export class MigrationsGroupBy {
  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: false
  })
  id!: number;

  @TypeGraphQL.Field(_type => GraphQLScalars.BigIntResolver, {
    nullable: false
  })
  timestamp!: bigint;

  @TypeGraphQL.Field(_type => String, {
    nullable: false
  })
  name!: string;

  @TypeGraphQL.Field(_type => MigrationsCountAggregate, {
    nullable: true
  })
  _count!: MigrationsCountAggregate | null;

  @TypeGraphQL.Field(_type => MigrationsAvgAggregate, {
    nullable: true
  })
  _avg!: MigrationsAvgAggregate | null;

  @TypeGraphQL.Field(_type => MigrationsSumAggregate, {
    nullable: true
  })
  _sum!: MigrationsSumAggregate | null;

  @TypeGraphQL.Field(_type => MigrationsMinAggregate, {
    nullable: true
  })
  _min!: MigrationsMinAggregate | null;

  @TypeGraphQL.Field(_type => MigrationsMaxAggregate, {
    nullable: true
  })
  _max!: MigrationsMaxAggregate | null;
}
