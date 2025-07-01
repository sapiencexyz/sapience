import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { ResourceUpdateWithoutResource_priceInput } from "../inputs/ResourceUpdateWithoutResource_priceInput";
import { ResourceWhereInput } from "../inputs/ResourceWhereInput";

@TypeGraphQL.InputType("ResourceUpdateToOneWithWhereWithoutResource_priceInput", {})
export class ResourceUpdateToOneWithWhereWithoutResource_priceInput {
  @TypeGraphQL.Field(_type => ResourceWhereInput, {
    nullable: true
  })
  where?: ResourceWhereInput | undefined;

  @TypeGraphQL.Field(_type => ResourceUpdateWithoutResource_priceInput, {
    nullable: false
  })
  data!: ResourceUpdateWithoutResource_priceInput;
}
