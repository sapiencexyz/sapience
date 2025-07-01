import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { ResourceCreateOrConnectWithoutMarket_groupInput } from "../inputs/ResourceCreateOrConnectWithoutMarket_groupInput";
import { ResourceCreateWithoutMarket_groupInput } from "../inputs/ResourceCreateWithoutMarket_groupInput";
import { ResourceUpdateToOneWithWhereWithoutMarket_groupInput } from "../inputs/ResourceUpdateToOneWithWhereWithoutMarket_groupInput";
import { ResourceUpsertWithoutMarket_groupInput } from "../inputs/ResourceUpsertWithoutMarket_groupInput";
import { ResourceWhereInput } from "../inputs/ResourceWhereInput";
import { ResourceWhereUniqueInput } from "../inputs/ResourceWhereUniqueInput";

@TypeGraphQL.InputType("ResourceUpdateOneWithoutMarket_groupNestedInput", {})
export class ResourceUpdateOneWithoutMarket_groupNestedInput {
  @TypeGraphQL.Field(_type => ResourceCreateWithoutMarket_groupInput, {
    nullable: true
  })
  create?: ResourceCreateWithoutMarket_groupInput | undefined;

  @TypeGraphQL.Field(_type => ResourceCreateOrConnectWithoutMarket_groupInput, {
    nullable: true
  })
  connectOrCreate?: ResourceCreateOrConnectWithoutMarket_groupInput | undefined;

  @TypeGraphQL.Field(_type => ResourceUpsertWithoutMarket_groupInput, {
    nullable: true
  })
  upsert?: ResourceUpsertWithoutMarket_groupInput | undefined;

  @TypeGraphQL.Field(_type => ResourceWhereInput, {
    nullable: true
  })
  disconnect?: ResourceWhereInput | undefined;

  @TypeGraphQL.Field(_type => ResourceWhereInput, {
    nullable: true
  })
  delete?: ResourceWhereInput | undefined;

  @TypeGraphQL.Field(_type => ResourceWhereUniqueInput, {
    nullable: true
  })
  connect?: ResourceWhereUniqueInput | undefined;

  @TypeGraphQL.Field(_type => ResourceUpdateToOneWithWhereWithoutMarket_groupInput, {
    nullable: true
  })
  update?: ResourceUpdateToOneWithWhereWithoutMarket_groupInput | undefined;
}
