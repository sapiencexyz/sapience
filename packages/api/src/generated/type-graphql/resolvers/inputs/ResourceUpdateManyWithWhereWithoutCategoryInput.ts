import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { ResourceScalarWhereInput } from "../inputs/ResourceScalarWhereInput";
import { ResourceUpdateManyMutationInput } from "../inputs/ResourceUpdateManyMutationInput";

@TypeGraphQL.InputType("ResourceUpdateManyWithWhereWithoutCategoryInput", {})
export class ResourceUpdateManyWithWhereWithoutCategoryInput {
  @TypeGraphQL.Field(_type => ResourceScalarWhereInput, {
    nullable: false
  })
  where!: ResourceScalarWhereInput;

  @TypeGraphQL.Field(_type => ResourceUpdateManyMutationInput, {
    nullable: false
  })
  data!: ResourceUpdateManyMutationInput;
}
