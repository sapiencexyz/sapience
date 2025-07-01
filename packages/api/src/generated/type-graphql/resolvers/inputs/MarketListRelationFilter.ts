import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { MarketWhereInput } from "../inputs/MarketWhereInput";

@TypeGraphQL.InputType("MarketListRelationFilter", {})
export class MarketListRelationFilter {
  @TypeGraphQL.Field(_type => MarketWhereInput, {
    nullable: true
  })
  every?: MarketWhereInput | undefined;

  @TypeGraphQL.Field(_type => MarketWhereInput, {
    nullable: true
  })
  some?: MarketWhereInput | undefined;

  @TypeGraphQL.Field(_type => MarketWhereInput, {
    nullable: true
  })
  none?: MarketWhereInput | undefined;
}
