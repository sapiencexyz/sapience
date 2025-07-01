import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { MarketWhereInput } from "../inputs/MarketWhereInput";

@TypeGraphQL.InputType("MarketNullableRelationFilter", {})
export class MarketNullableRelationFilter {
  @TypeGraphQL.Field(_type => MarketWhereInput, {
    nullable: true
  })
  is?: MarketWhereInput | undefined;

  @TypeGraphQL.Field(_type => MarketWhereInput, {
    nullable: true
  })
  isNot?: MarketWhereInput | undefined;
}
