import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";

@TypeGraphQL.InputType("Cache_paramCreateInput", {})
export class Cache_paramCreateInput {
  @TypeGraphQL.Field(_type => Date, {
    nullable: true
  })
  createdAt?: Date | undefined;

  @TypeGraphQL.Field(_type => String, {
    nullable: false
  })
  paramName!: string;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: false
  })
  paramValueNumber!: Prisma.Decimal;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  paramValueString?: string | undefined;
}
