import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_groupWhereInput } from "../inputs/Market_groupWhereInput";

@TypeGraphQL.InputType("Market_groupListRelationFilter", {})
export class Market_groupListRelationFilter {
  @TypeGraphQL.Field(_type => Market_groupWhereInput, {
    nullable: true
  })
  every?: Market_groupWhereInput | undefined;

  @TypeGraphQL.Field(_type => Market_groupWhereInput, {
    nullable: true
  })
  some?: Market_groupWhereInput | undefined;

  @TypeGraphQL.Field(_type => Market_groupWhereInput, {
    nullable: true
  })
  none?: Market_groupWhereInput | undefined;
}
