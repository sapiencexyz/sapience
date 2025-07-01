import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_groupCreateOrConnectWithoutMarketInput } from "../inputs/Market_groupCreateOrConnectWithoutMarketInput";
import { Market_groupCreateWithoutMarketInput } from "../inputs/Market_groupCreateWithoutMarketInput";
import { Market_groupWhereUniqueInput } from "../inputs/Market_groupWhereUniqueInput";

@TypeGraphQL.InputType("Market_groupCreateNestedOneWithoutMarketInput", {})
export class Market_groupCreateNestedOneWithoutMarketInput {
  @TypeGraphQL.Field(_type => Market_groupCreateWithoutMarketInput, {
    nullable: true
  })
  create?: Market_groupCreateWithoutMarketInput | undefined;

  @TypeGraphQL.Field(_type => Market_groupCreateOrConnectWithoutMarketInput, {
    nullable: true
  })
  connectOrCreate?: Market_groupCreateOrConnectWithoutMarketInput | undefined;

  @TypeGraphQL.Field(_type => Market_groupWhereUniqueInput, {
    nullable: true
  })
  connect?: Market_groupWhereUniqueInput | undefined;
}
