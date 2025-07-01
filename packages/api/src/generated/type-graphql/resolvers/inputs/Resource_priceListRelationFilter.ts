import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Resource_priceWhereInput } from "../inputs/Resource_priceWhereInput";

@TypeGraphQL.InputType("Resource_priceListRelationFilter", {})
export class Resource_priceListRelationFilter {
  @TypeGraphQL.Field(_type => Resource_priceWhereInput, {
    nullable: true
  })
  every?: Resource_priceWhereInput | undefined;

  @TypeGraphQL.Field(_type => Resource_priceWhereInput, {
    nullable: true
  })
  some?: Resource_priceWhereInput | undefined;

  @TypeGraphQL.Field(_type => Resource_priceWhereInput, {
    nullable: true
  })
  none?: Resource_priceWhereInput | undefined;
}
