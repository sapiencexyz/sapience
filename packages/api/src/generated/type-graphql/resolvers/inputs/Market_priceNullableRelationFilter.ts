import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_priceWhereInput } from "../inputs/Market_priceWhereInput";

@TypeGraphQL.InputType("Market_priceNullableRelationFilter", {})
export class Market_priceNullableRelationFilter {
  @TypeGraphQL.Field(_type => Market_priceWhereInput, {
    nullable: true
  })
  is?: Market_priceWhereInput | undefined;

  @TypeGraphQL.Field(_type => Market_priceWhereInput, {
    nullable: true
  })
  isNot?: Market_priceWhereInput | undefined;
}
