import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { ResourceCreateWithoutCategoryInput } from "../inputs/ResourceCreateWithoutCategoryInput";
import { ResourceUpdateWithoutCategoryInput } from "../inputs/ResourceUpdateWithoutCategoryInput";
import { ResourceWhereUniqueInput } from "../inputs/ResourceWhereUniqueInput";

@TypeGraphQL.InputType("ResourceUpsertWithWhereUniqueWithoutCategoryInput", {})
export class ResourceUpsertWithWhereUniqueWithoutCategoryInput {
  @TypeGraphQL.Field(_type => ResourceWhereUniqueInput, {
    nullable: false
  })
  where!: ResourceWhereUniqueInput;

  @TypeGraphQL.Field(_type => ResourceUpdateWithoutCategoryInput, {
    nullable: false
  })
  update!: ResourceUpdateWithoutCategoryInput;

  @TypeGraphQL.Field(_type => ResourceCreateWithoutCategoryInput, {
    nullable: false
  })
  create!: ResourceCreateWithoutCategoryInput;
}
