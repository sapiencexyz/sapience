import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_groupCreateNestedManyWithoutCategoryInput } from "../inputs/Market_groupCreateNestedManyWithoutCategoryInput";

@TypeGraphQL.InputType("CategoryCreateWithoutResourceInput", {})
export class CategoryCreateWithoutResourceInput {
  @TypeGraphQL.Field(_type => Date, {
    nullable: true
  })
  createdAt?: Date | undefined;

  @TypeGraphQL.Field(_type => String, {
    nullable: false
  })
  name!: string;

  @TypeGraphQL.Field(_type => String, {
    nullable: false
  })
  slug!: string;

  @TypeGraphQL.Field(_type => Market_groupCreateNestedManyWithoutCategoryInput, {
    nullable: true
  })
  market_group?: Market_groupCreateNestedManyWithoutCategoryInput | undefined;
}
