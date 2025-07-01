import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_groupCreateWithoutCategoryInput } from "../inputs/Market_groupCreateWithoutCategoryInput";
import { Market_groupWhereUniqueInput } from "../inputs/Market_groupWhereUniqueInput";

@TypeGraphQL.InputType("Market_groupCreateOrConnectWithoutCategoryInput", {})
export class Market_groupCreateOrConnectWithoutCategoryInput {
  @TypeGraphQL.Field(_type => Market_groupWhereUniqueInput, {
    nullable: false
  })
  where!: Market_groupWhereUniqueInput;

  @TypeGraphQL.Field(_type => Market_groupCreateWithoutCategoryInput, {
    nullable: false
  })
  create!: Market_groupCreateWithoutCategoryInput;
}
