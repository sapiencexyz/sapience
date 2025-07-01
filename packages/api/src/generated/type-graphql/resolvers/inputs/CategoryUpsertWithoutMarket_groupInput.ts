import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { CategoryCreateWithoutMarket_groupInput } from "../inputs/CategoryCreateWithoutMarket_groupInput";
import { CategoryUpdateWithoutMarket_groupInput } from "../inputs/CategoryUpdateWithoutMarket_groupInput";
import { CategoryWhereInput } from "../inputs/CategoryWhereInput";

@TypeGraphQL.InputType("CategoryUpsertWithoutMarket_groupInput", {})
export class CategoryUpsertWithoutMarket_groupInput {
  @TypeGraphQL.Field(_type => CategoryUpdateWithoutMarket_groupInput, {
    nullable: false
  })
  update!: CategoryUpdateWithoutMarket_groupInput;

  @TypeGraphQL.Field(_type => CategoryCreateWithoutMarket_groupInput, {
    nullable: false
  })
  create!: CategoryCreateWithoutMarket_groupInput;

  @TypeGraphQL.Field(_type => CategoryWhereInput, {
    nullable: true
  })
  where?: CategoryWhereInput | undefined;
}
