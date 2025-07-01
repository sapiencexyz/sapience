import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Resource_priceUpdateWithoutResourceInput } from "../inputs/Resource_priceUpdateWithoutResourceInput";
import { Resource_priceWhereUniqueInput } from "../inputs/Resource_priceWhereUniqueInput";

@TypeGraphQL.InputType("Resource_priceUpdateWithWhereUniqueWithoutResourceInput", {})
export class Resource_priceUpdateWithWhereUniqueWithoutResourceInput {
  @TypeGraphQL.Field(_type => Resource_priceWhereUniqueInput, {
    nullable: false
  })
  where!: Resource_priceWhereUniqueInput;

  @TypeGraphQL.Field(_type => Resource_priceUpdateWithoutResourceInput, {
    nullable: false
  })
  data!: Resource_priceUpdateWithoutResourceInput;
}
