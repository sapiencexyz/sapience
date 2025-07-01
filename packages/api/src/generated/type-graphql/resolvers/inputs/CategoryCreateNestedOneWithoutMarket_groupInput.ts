import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { CategoryCreateOrConnectWithoutMarket_groupInput } from "../inputs/CategoryCreateOrConnectWithoutMarket_groupInput";
import { CategoryCreateWithoutMarket_groupInput } from "../inputs/CategoryCreateWithoutMarket_groupInput";
import { CategoryWhereUniqueInput } from "../inputs/CategoryWhereUniqueInput";

@TypeGraphQL.InputType("CategoryCreateNestedOneWithoutMarket_groupInput", {})
export class CategoryCreateNestedOneWithoutMarket_groupInput {
  @TypeGraphQL.Field(_type => CategoryCreateWithoutMarket_groupInput, {
    nullable: true
  })
  create?: CategoryCreateWithoutMarket_groupInput | undefined;

  @TypeGraphQL.Field(_type => CategoryCreateOrConnectWithoutMarket_groupInput, {
    nullable: true
  })
  connectOrCreate?: CategoryCreateOrConnectWithoutMarket_groupInput | undefined;

  @TypeGraphQL.Field(_type => CategoryWhereUniqueInput, {
    nullable: true
  })
  connect?: CategoryWhereUniqueInput | undefined;
}
