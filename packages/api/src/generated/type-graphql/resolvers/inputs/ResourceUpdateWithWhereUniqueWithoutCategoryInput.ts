import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { ResourceUpdateWithoutCategoryInput } from "../inputs/ResourceUpdateWithoutCategoryInput";
import { ResourceWhereUniqueInput } from "../inputs/ResourceWhereUniqueInput";

@TypeGraphQL.InputType("ResourceUpdateWithWhereUniqueWithoutCategoryInput", {})
export class ResourceUpdateWithWhereUniqueWithoutCategoryInput {
  @TypeGraphQL.Field(_type => ResourceWhereUniqueInput, {
    nullable: false
  })
  where!: ResourceWhereUniqueInput;

  @TypeGraphQL.Field(_type => ResourceUpdateWithoutCategoryInput, {
    nullable: false
  })
  data!: ResourceUpdateWithoutCategoryInput;
}
