import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";

@TypeGraphQL.InputType("MigrationsCreateInput", {})
export class MigrationsCreateInput {
  @TypeGraphQL.Field(_type => GraphQLScalars.BigIntResolver, {
    nullable: false
  })
  timestamp!: bigint;

  @TypeGraphQL.Field(_type => String, {
    nullable: false
  })
  name!: string;
}
