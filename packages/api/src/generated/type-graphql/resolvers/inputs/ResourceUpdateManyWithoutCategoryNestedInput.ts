import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { ResourceCreateManyCategoryInputEnvelope } from "../inputs/ResourceCreateManyCategoryInputEnvelope";
import { ResourceCreateOrConnectWithoutCategoryInput } from "../inputs/ResourceCreateOrConnectWithoutCategoryInput";
import { ResourceCreateWithoutCategoryInput } from "../inputs/ResourceCreateWithoutCategoryInput";
import { ResourceScalarWhereInput } from "../inputs/ResourceScalarWhereInput";
import { ResourceUpdateManyWithWhereWithoutCategoryInput } from "../inputs/ResourceUpdateManyWithWhereWithoutCategoryInput";
import { ResourceUpdateWithWhereUniqueWithoutCategoryInput } from "../inputs/ResourceUpdateWithWhereUniqueWithoutCategoryInput";
import { ResourceUpsertWithWhereUniqueWithoutCategoryInput } from "../inputs/ResourceUpsertWithWhereUniqueWithoutCategoryInput";
import { ResourceWhereUniqueInput } from "../inputs/ResourceWhereUniqueInput";

@TypeGraphQL.InputType("ResourceUpdateManyWithoutCategoryNestedInput", {})
export class ResourceUpdateManyWithoutCategoryNestedInput {
  @TypeGraphQL.Field(_type => [ResourceCreateWithoutCategoryInput], {
    nullable: true
  })
  create?: ResourceCreateWithoutCategoryInput[] | undefined;

  @TypeGraphQL.Field(_type => [ResourceCreateOrConnectWithoutCategoryInput], {
    nullable: true
  })
  connectOrCreate?: ResourceCreateOrConnectWithoutCategoryInput[] | undefined;

  @TypeGraphQL.Field(_type => [ResourceUpsertWithWhereUniqueWithoutCategoryInput], {
    nullable: true
  })
  upsert?: ResourceUpsertWithWhereUniqueWithoutCategoryInput[] | undefined;

  @TypeGraphQL.Field(_type => ResourceCreateManyCategoryInputEnvelope, {
    nullable: true
  })
  createMany?: ResourceCreateManyCategoryInputEnvelope | undefined;

  @TypeGraphQL.Field(_type => [ResourceWhereUniqueInput], {
    nullable: true
  })
  set?: ResourceWhereUniqueInput[] | undefined;

  @TypeGraphQL.Field(_type => [ResourceWhereUniqueInput], {
    nullable: true
  })
  disconnect?: ResourceWhereUniqueInput[] | undefined;

  @TypeGraphQL.Field(_type => [ResourceWhereUniqueInput], {
    nullable: true
  })
  delete?: ResourceWhereUniqueInput[] | undefined;

  @TypeGraphQL.Field(_type => [ResourceWhereUniqueInput], {
    nullable: true
  })
  connect?: ResourceWhereUniqueInput[] | undefined;

  @TypeGraphQL.Field(_type => [ResourceUpdateWithWhereUniqueWithoutCategoryInput], {
    nullable: true
  })
  update?: ResourceUpdateWithWhereUniqueWithoutCategoryInput[] | undefined;

  @TypeGraphQL.Field(_type => [ResourceUpdateManyWithWhereWithoutCategoryInput], {
    nullable: true
  })
  updateMany?: ResourceUpdateManyWithWhereWithoutCategoryInput[] | undefined;

  @TypeGraphQL.Field(_type => [ResourceScalarWhereInput], {
    nullable: true
  })
  deleteMany?: ResourceScalarWhereInput[] | undefined;
}
