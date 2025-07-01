import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Resource_priceCreateWithoutResourceInput } from "../inputs/Resource_priceCreateWithoutResourceInput";
import { Resource_priceWhereUniqueInput } from "../inputs/Resource_priceWhereUniqueInput";

@TypeGraphQL.InputType("Resource_priceCreateOrConnectWithoutResourceInput", {})
export class Resource_priceCreateOrConnectWithoutResourceInput {
  @TypeGraphQL.Field(_type => Resource_priceWhereUniqueInput, {
    nullable: false
  })
  where!: Resource_priceWhereUniqueInput;

  @TypeGraphQL.Field(_type => Resource_priceCreateWithoutResourceInput, {
    nullable: false
  })
  create!: Resource_priceCreateWithoutResourceInput;
}
