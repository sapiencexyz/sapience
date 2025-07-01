import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_groupUpdateWithoutMarketInput } from "../inputs/Market_groupUpdateWithoutMarketInput";
import { Market_groupWhereInput } from "../inputs/Market_groupWhereInput";

@TypeGraphQL.InputType("Market_groupUpdateToOneWithWhereWithoutMarketInput", {})
export class Market_groupUpdateToOneWithWhereWithoutMarketInput {
  @TypeGraphQL.Field(_type => Market_groupWhereInput, {
    nullable: true
  })
  where?: Market_groupWhereInput | undefined;

  @TypeGraphQL.Field(_type => Market_groupUpdateWithoutMarketInput, {
    nullable: false
  })
  data!: Market_groupUpdateWithoutMarketInput;
}
