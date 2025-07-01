import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { ResourceCreateNestedManyWithoutCategoryInput } from "../inputs/ResourceCreateNestedManyWithoutCategoryInput";

@TypeGraphQL.InputType("CategoryCreateWithoutMarket_groupInput", {})
export class CategoryCreateWithoutMarket_groupInput {
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

  @TypeGraphQL.Field(_type => ResourceCreateNestedManyWithoutCategoryInput, {
    nullable: true
  })
  resource?: ResourceCreateNestedManyWithoutCategoryInput | undefined;
}
