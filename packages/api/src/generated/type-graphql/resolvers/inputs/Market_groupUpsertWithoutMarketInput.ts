import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_groupCreateWithoutMarketInput } from "../inputs/Market_groupCreateWithoutMarketInput";
import { Market_groupUpdateWithoutMarketInput } from "../inputs/Market_groupUpdateWithoutMarketInput";
import { Market_groupWhereInput } from "../inputs/Market_groupWhereInput";

@TypeGraphQL.InputType("Market_groupUpsertWithoutMarketInput", {})
export class Market_groupUpsertWithoutMarketInput {
  @TypeGraphQL.Field(_type => Market_groupUpdateWithoutMarketInput, {
    nullable: false
  })
  update!: Market_groupUpdateWithoutMarketInput;

  @TypeGraphQL.Field(_type => Market_groupCreateWithoutMarketInput, {
    nullable: false
  })
  create!: Market_groupCreateWithoutMarketInput;

  @TypeGraphQL.Field(_type => Market_groupWhereInput, {
    nullable: true
  })
  where?: Market_groupWhereInput | undefined;
}
