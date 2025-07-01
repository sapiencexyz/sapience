import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_groupCreateWithoutMarketInput } from "../inputs/Market_groupCreateWithoutMarketInput";
import { Market_groupWhereUniqueInput } from "../inputs/Market_groupWhereUniqueInput";

@TypeGraphQL.InputType("Market_groupCreateOrConnectWithoutMarketInput", {})
export class Market_groupCreateOrConnectWithoutMarketInput {
  @TypeGraphQL.Field(_type => Market_groupWhereUniqueInput, {
    nullable: false
  })
  where!: Market_groupWhereUniqueInput;

  @TypeGraphQL.Field(_type => Market_groupCreateWithoutMarketInput, {
    nullable: false
  })
  create!: Market_groupCreateWithoutMarketInput;
}
