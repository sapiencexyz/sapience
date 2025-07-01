import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { ResourceCreateWithoutCategoryInput } from "../inputs/ResourceCreateWithoutCategoryInput";
import { ResourceWhereUniqueInput } from "../inputs/ResourceWhereUniqueInput";

@TypeGraphQL.InputType("ResourceCreateOrConnectWithoutCategoryInput", {})
export class ResourceCreateOrConnectWithoutCategoryInput {
  @TypeGraphQL.Field(_type => ResourceWhereUniqueInput, {
    nullable: false
  })
  where!: ResourceWhereUniqueInput;

  @TypeGraphQL.Field(_type => ResourceCreateWithoutCategoryInput, {
    nullable: false
  })
  create!: ResourceCreateWithoutCategoryInput;
}
