import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { CategoryCreateWithoutMarket_groupInput } from "../inputs/CategoryCreateWithoutMarket_groupInput";
import { CategoryWhereUniqueInput } from "../inputs/CategoryWhereUniqueInput";

@TypeGraphQL.InputType("CategoryCreateOrConnectWithoutMarket_groupInput", {})
export class CategoryCreateOrConnectWithoutMarket_groupInput {
  @TypeGraphQL.Field(_type => CategoryWhereUniqueInput, {
    nullable: false
  })
  where!: CategoryWhereUniqueInput;

  @TypeGraphQL.Field(_type => CategoryCreateWithoutMarket_groupInput, {
    nullable: false
  })
  create!: CategoryCreateWithoutMarket_groupInput;
}
