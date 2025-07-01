import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { ResourceCreateManyCategoryInputEnvelope } from "../inputs/ResourceCreateManyCategoryInputEnvelope";
import { ResourceCreateOrConnectWithoutCategoryInput } from "../inputs/ResourceCreateOrConnectWithoutCategoryInput";
import { ResourceCreateWithoutCategoryInput } from "../inputs/ResourceCreateWithoutCategoryInput";
import { ResourceWhereUniqueInput } from "../inputs/ResourceWhereUniqueInput";

@TypeGraphQL.InputType("ResourceCreateNestedManyWithoutCategoryInput", {})
export class ResourceCreateNestedManyWithoutCategoryInput {
  @TypeGraphQL.Field(_type => [ResourceCreateWithoutCategoryInput], {
    nullable: true
  })
  create?: ResourceCreateWithoutCategoryInput[] | undefined;

  @TypeGraphQL.Field(_type => [ResourceCreateOrConnectWithoutCategoryInput], {
    nullable: true
  })
  connectOrCreate?: ResourceCreateOrConnectWithoutCategoryInput[] | undefined;

  @TypeGraphQL.Field(_type => ResourceCreateManyCategoryInputEnvelope, {
    nullable: true
  })
  createMany?: ResourceCreateManyCategoryInputEnvelope | undefined;

  @TypeGraphQL.Field(_type => [ResourceWhereUniqueInput], {
    nullable: true
  })
  connect?: ResourceWhereUniqueInput[] | undefined;
}
