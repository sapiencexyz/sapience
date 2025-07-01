import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_groupCreateManyCategoryInputEnvelope } from "../inputs/Market_groupCreateManyCategoryInputEnvelope";
import { Market_groupCreateOrConnectWithoutCategoryInput } from "../inputs/Market_groupCreateOrConnectWithoutCategoryInput";
import { Market_groupCreateWithoutCategoryInput } from "../inputs/Market_groupCreateWithoutCategoryInput";
import { Market_groupWhereUniqueInput } from "../inputs/Market_groupWhereUniqueInput";

@TypeGraphQL.InputType("Market_groupCreateNestedManyWithoutCategoryInput", {})
export class Market_groupCreateNestedManyWithoutCategoryInput {
  @TypeGraphQL.Field(_type => [Market_groupCreateWithoutCategoryInput], {
    nullable: true
  })
  create?: Market_groupCreateWithoutCategoryInput[] | undefined;

  @TypeGraphQL.Field(_type => [Market_groupCreateOrConnectWithoutCategoryInput], {
    nullable: true
  })
  connectOrCreate?: Market_groupCreateOrConnectWithoutCategoryInput[] | undefined;

  @TypeGraphQL.Field(_type => Market_groupCreateManyCategoryInputEnvelope, {
    nullable: true
  })
  createMany?: Market_groupCreateManyCategoryInputEnvelope | undefined;

  @TypeGraphQL.Field(_type => [Market_groupWhereUniqueInput], {
    nullable: true
  })
  connect?: Market_groupWhereUniqueInput[] | undefined;
}
