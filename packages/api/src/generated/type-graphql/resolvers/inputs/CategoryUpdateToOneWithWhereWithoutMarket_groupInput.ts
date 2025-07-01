import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { CategoryUpdateWithoutMarket_groupInput } from "../inputs/CategoryUpdateWithoutMarket_groupInput";
import { CategoryWhereInput } from "../inputs/CategoryWhereInput";

@TypeGraphQL.InputType("CategoryUpdateToOneWithWhereWithoutMarket_groupInput", {})
export class CategoryUpdateToOneWithWhereWithoutMarket_groupInput {
  @TypeGraphQL.Field(_type => CategoryWhereInput, {
    nullable: true
  })
  where?: CategoryWhereInput | undefined;

  @TypeGraphQL.Field(_type => CategoryUpdateWithoutMarket_groupInput, {
    nullable: false
  })
  data!: CategoryUpdateWithoutMarket_groupInput;
}
