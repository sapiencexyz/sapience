import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Resource_priceScalarWhereInput } from "../inputs/Resource_priceScalarWhereInput";
import { Resource_priceUpdateManyMutationInput } from "../inputs/Resource_priceUpdateManyMutationInput";

@TypeGraphQL.InputType("Resource_priceUpdateManyWithWhereWithoutResourceInput", {})
export class Resource_priceUpdateManyWithWhereWithoutResourceInput {
  @TypeGraphQL.Field(_type => Resource_priceScalarWhereInput, {
    nullable: false
  })
  where!: Resource_priceScalarWhereInput;

  @TypeGraphQL.Field(_type => Resource_priceUpdateManyMutationInput, {
    nullable: false
  })
  data!: Resource_priceUpdateManyMutationInput;
}
