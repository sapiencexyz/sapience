import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { ResourceCreateWithoutResource_priceInput } from "../inputs/ResourceCreateWithoutResource_priceInput";
import { ResourceUpdateWithoutResource_priceInput } from "../inputs/ResourceUpdateWithoutResource_priceInput";
import { ResourceWhereInput } from "../inputs/ResourceWhereInput";

@TypeGraphQL.InputType("ResourceUpsertWithoutResource_priceInput", {})
export class ResourceUpsertWithoutResource_priceInput {
  @TypeGraphQL.Field(_type => ResourceUpdateWithoutResource_priceInput, {
    nullable: false
  })
  update!: ResourceUpdateWithoutResource_priceInput;

  @TypeGraphQL.Field(_type => ResourceCreateWithoutResource_priceInput, {
    nullable: false
  })
  create!: ResourceCreateWithoutResource_priceInput;

  @TypeGraphQL.Field(_type => ResourceWhereInput, {
    nullable: true
  })
  where?: ResourceWhereInput | undefined;
}
