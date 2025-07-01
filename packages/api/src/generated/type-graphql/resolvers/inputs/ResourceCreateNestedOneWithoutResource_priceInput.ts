import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { ResourceCreateOrConnectWithoutResource_priceInput } from "../inputs/ResourceCreateOrConnectWithoutResource_priceInput";
import { ResourceCreateWithoutResource_priceInput } from "../inputs/ResourceCreateWithoutResource_priceInput";
import { ResourceWhereUniqueInput } from "../inputs/ResourceWhereUniqueInput";

@TypeGraphQL.InputType("ResourceCreateNestedOneWithoutResource_priceInput", {})
export class ResourceCreateNestedOneWithoutResource_priceInput {
  @TypeGraphQL.Field(_type => ResourceCreateWithoutResource_priceInput, {
    nullable: true
  })
  create?: ResourceCreateWithoutResource_priceInput | undefined;

  @TypeGraphQL.Field(_type => ResourceCreateOrConnectWithoutResource_priceInput, {
    nullable: true
  })
  connectOrCreate?: ResourceCreateOrConnectWithoutResource_priceInput | undefined;

  @TypeGraphQL.Field(_type => ResourceWhereUniqueInput, {
    nullable: true
  })
  connect?: ResourceWhereUniqueInput | undefined;
}
