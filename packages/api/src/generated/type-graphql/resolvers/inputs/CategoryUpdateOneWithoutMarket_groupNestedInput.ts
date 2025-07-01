import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { CategoryCreateOrConnectWithoutMarket_groupInput } from "../inputs/CategoryCreateOrConnectWithoutMarket_groupInput";
import { CategoryCreateWithoutMarket_groupInput } from "../inputs/CategoryCreateWithoutMarket_groupInput";
import { CategoryUpdateToOneWithWhereWithoutMarket_groupInput } from "../inputs/CategoryUpdateToOneWithWhereWithoutMarket_groupInput";
import { CategoryUpsertWithoutMarket_groupInput } from "../inputs/CategoryUpsertWithoutMarket_groupInput";
import { CategoryWhereInput } from "../inputs/CategoryWhereInput";
import { CategoryWhereUniqueInput } from "../inputs/CategoryWhereUniqueInput";

@TypeGraphQL.InputType("CategoryUpdateOneWithoutMarket_groupNestedInput", {})
export class CategoryUpdateOneWithoutMarket_groupNestedInput {
  @TypeGraphQL.Field(_type => CategoryCreateWithoutMarket_groupInput, {
    nullable: true
  })
  create?: CategoryCreateWithoutMarket_groupInput | undefined;

  @TypeGraphQL.Field(_type => CategoryCreateOrConnectWithoutMarket_groupInput, {
    nullable: true
  })
  connectOrCreate?: CategoryCreateOrConnectWithoutMarket_groupInput | undefined;

  @TypeGraphQL.Field(_type => CategoryUpsertWithoutMarket_groupInput, {
    nullable: true
  })
  upsert?: CategoryUpsertWithoutMarket_groupInput | undefined;

  @TypeGraphQL.Field(_type => CategoryWhereInput, {
    nullable: true
  })
  disconnect?: CategoryWhereInput | undefined;

  @TypeGraphQL.Field(_type => CategoryWhereInput, {
    nullable: true
  })
  delete?: CategoryWhereInput | undefined;

  @TypeGraphQL.Field(_type => CategoryWhereUniqueInput, {
    nullable: true
  })
  connect?: CategoryWhereUniqueInput | undefined;

  @TypeGraphQL.Field(_type => CategoryUpdateToOneWithWhereWithoutMarket_groupInput, {
    nullable: true
  })
  update?: CategoryUpdateToOneWithWhereWithoutMarket_groupInput | undefined;
}
