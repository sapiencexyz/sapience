import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { ResourceCreateOrConnectWithoutResource_priceInput } from "../inputs/ResourceCreateOrConnectWithoutResource_priceInput";
import { ResourceCreateWithoutResource_priceInput } from "../inputs/ResourceCreateWithoutResource_priceInput";
import { ResourceUpdateToOneWithWhereWithoutResource_priceInput } from "../inputs/ResourceUpdateToOneWithWhereWithoutResource_priceInput";
import { ResourceUpsertWithoutResource_priceInput } from "../inputs/ResourceUpsertWithoutResource_priceInput";
import { ResourceWhereInput } from "../inputs/ResourceWhereInput";
import { ResourceWhereUniqueInput } from "../inputs/ResourceWhereUniqueInput";

@TypeGraphQL.InputType("ResourceUpdateOneWithoutResource_priceNestedInput", {})
export class ResourceUpdateOneWithoutResource_priceNestedInput {
  @TypeGraphQL.Field(_type => ResourceCreateWithoutResource_priceInput, {
    nullable: true
  })
  create?: ResourceCreateWithoutResource_priceInput | undefined;

  @TypeGraphQL.Field(_type => ResourceCreateOrConnectWithoutResource_priceInput, {
    nullable: true
  })
  connectOrCreate?: ResourceCreateOrConnectWithoutResource_priceInput | undefined;

  @TypeGraphQL.Field(_type => ResourceUpsertWithoutResource_priceInput, {
    nullable: true
  })
  upsert?: ResourceUpsertWithoutResource_priceInput | undefined;

  @TypeGraphQL.Field(_type => ResourceWhereInput, {
    nullable: true
  })
  disconnect?: ResourceWhereInput | undefined;

  @TypeGraphQL.Field(_type => ResourceWhereInput, {
    nullable: true
  })
  delete?: ResourceWhereInput | undefined;

  @TypeGraphQL.Field(_type => ResourceWhereUniqueInput, {
    nullable: true
  })
  connect?: ResourceWhereUniqueInput | undefined;

  @TypeGraphQL.Field(_type => ResourceUpdateToOneWithWhereWithoutResource_priceInput, {
    nullable: true
  })
  update?: ResourceUpdateToOneWithWhereWithoutResource_priceInput | undefined;
}
