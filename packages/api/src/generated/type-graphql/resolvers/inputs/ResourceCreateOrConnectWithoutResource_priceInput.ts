import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { ResourceCreateWithoutResource_priceInput } from "../inputs/ResourceCreateWithoutResource_priceInput";
import { ResourceWhereUniqueInput } from "../inputs/ResourceWhereUniqueInput";

@TypeGraphQL.InputType("ResourceCreateOrConnectWithoutResource_priceInput", {})
export class ResourceCreateOrConnectWithoutResource_priceInput {
  @TypeGraphQL.Field(_type => ResourceWhereUniqueInput, {
    nullable: false
  })
  where!: ResourceWhereUniqueInput;

  @TypeGraphQL.Field(_type => ResourceCreateWithoutResource_priceInput, {
    nullable: false
  })
  create!: ResourceCreateWithoutResource_priceInput;
}
