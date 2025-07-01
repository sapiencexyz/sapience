import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_groupWhereInput } from "../inputs/Market_groupWhereInput";

@TypeGraphQL.InputType("Market_groupNullableRelationFilter", {})
export class Market_groupNullableRelationFilter {
  @TypeGraphQL.Field(_type => Market_groupWhereInput, {
    nullable: true
  })
  is?: Market_groupWhereInput | undefined;

  @TypeGraphQL.Field(_type => Market_groupWhereInput, {
    nullable: true
  })
  isNot?: Market_groupWhereInput | undefined;
}
