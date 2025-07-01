import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { ResourceCreateOrConnectWithoutMarket_groupInput } from "../inputs/ResourceCreateOrConnectWithoutMarket_groupInput";
import { ResourceCreateWithoutMarket_groupInput } from "../inputs/ResourceCreateWithoutMarket_groupInput";
import { ResourceWhereUniqueInput } from "../inputs/ResourceWhereUniqueInput";

@TypeGraphQL.InputType("ResourceCreateNestedOneWithoutMarket_groupInput", {})
export class ResourceCreateNestedOneWithoutMarket_groupInput {
  @TypeGraphQL.Field(_type => ResourceCreateWithoutMarket_groupInput, {
    nullable: true
  })
  create?: ResourceCreateWithoutMarket_groupInput | undefined;

  @TypeGraphQL.Field(_type => ResourceCreateOrConnectWithoutMarket_groupInput, {
    nullable: true
  })
  connectOrCreate?: ResourceCreateOrConnectWithoutMarket_groupInput | undefined;

  @TypeGraphQL.Field(_type => ResourceWhereUniqueInput, {
    nullable: true
  })
  connect?: ResourceWhereUniqueInput | undefined;
}
