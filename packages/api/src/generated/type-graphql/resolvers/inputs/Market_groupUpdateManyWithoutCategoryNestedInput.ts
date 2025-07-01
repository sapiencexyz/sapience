import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_groupCreateManyCategoryInputEnvelope } from "../inputs/Market_groupCreateManyCategoryInputEnvelope";
import { Market_groupCreateOrConnectWithoutCategoryInput } from "../inputs/Market_groupCreateOrConnectWithoutCategoryInput";
import { Market_groupCreateWithoutCategoryInput } from "../inputs/Market_groupCreateWithoutCategoryInput";
import { Market_groupScalarWhereInput } from "../inputs/Market_groupScalarWhereInput";
import { Market_groupUpdateManyWithWhereWithoutCategoryInput } from "../inputs/Market_groupUpdateManyWithWhereWithoutCategoryInput";
import { Market_groupUpdateWithWhereUniqueWithoutCategoryInput } from "../inputs/Market_groupUpdateWithWhereUniqueWithoutCategoryInput";
import { Market_groupUpsertWithWhereUniqueWithoutCategoryInput } from "../inputs/Market_groupUpsertWithWhereUniqueWithoutCategoryInput";
import { Market_groupWhereUniqueInput } from "../inputs/Market_groupWhereUniqueInput";

@TypeGraphQL.InputType("Market_groupUpdateManyWithoutCategoryNestedInput", {})
export class Market_groupUpdateManyWithoutCategoryNestedInput {
  @TypeGraphQL.Field(_type => [Market_groupCreateWithoutCategoryInput], {
    nullable: true
  })
  create?: Market_groupCreateWithoutCategoryInput[] | undefined;

  @TypeGraphQL.Field(_type => [Market_groupCreateOrConnectWithoutCategoryInput], {
    nullable: true
  })
  connectOrCreate?: Market_groupCreateOrConnectWithoutCategoryInput[] | undefined;

  @TypeGraphQL.Field(_type => [Market_groupUpsertWithWhereUniqueWithoutCategoryInput], {
    nullable: true
  })
  upsert?: Market_groupUpsertWithWhereUniqueWithoutCategoryInput[] | undefined;

  @TypeGraphQL.Field(_type => Market_groupCreateManyCategoryInputEnvelope, {
    nullable: true
  })
  createMany?: Market_groupCreateManyCategoryInputEnvelope | undefined;

  @TypeGraphQL.Field(_type => [Market_groupWhereUniqueInput], {
    nullable: true
  })
  set?: Market_groupWhereUniqueInput[] | undefined;

  @TypeGraphQL.Field(_type => [Market_groupWhereUniqueInput], {
    nullable: true
  })
  disconnect?: Market_groupWhereUniqueInput[] | undefined;

  @TypeGraphQL.Field(_type => [Market_groupWhereUniqueInput], {
    nullable: true
  })
  delete?: Market_groupWhereUniqueInput[] | undefined;

  @TypeGraphQL.Field(_type => [Market_groupWhereUniqueInput], {
    nullable: true
  })
  connect?: Market_groupWhereUniqueInput[] | undefined;

  @TypeGraphQL.Field(_type => [Market_groupUpdateWithWhereUniqueWithoutCategoryInput], {
    nullable: true
  })
  update?: Market_groupUpdateWithWhereUniqueWithoutCategoryInput[] | undefined;

  @TypeGraphQL.Field(_type => [Market_groupUpdateManyWithWhereWithoutCategoryInput], {
    nullable: true
  })
  updateMany?: Market_groupUpdateManyWithWhereWithoutCategoryInput[] | undefined;

  @TypeGraphQL.Field(_type => [Market_groupScalarWhereInput], {
    nullable: true
  })
  deleteMany?: Market_groupScalarWhereInput[] | undefined;
}
