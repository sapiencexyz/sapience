import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_groupUpdateWithoutCategoryInput } from "../inputs/Market_groupUpdateWithoutCategoryInput";
import { Market_groupWhereUniqueInput } from "../inputs/Market_groupWhereUniqueInput";

@TypeGraphQL.InputType("Market_groupUpdateWithWhereUniqueWithoutCategoryInput", {})
export class Market_groupUpdateWithWhereUniqueWithoutCategoryInput {
  @TypeGraphQL.Field(_type => Market_groupWhereUniqueInput, {
    nullable: false
  })
  where!: Market_groupWhereUniqueInput;

  @TypeGraphQL.Field(_type => Market_groupUpdateWithoutCategoryInput, {
    nullable: false
  })
  data!: Market_groupUpdateWithoutCategoryInput;
}
