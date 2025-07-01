import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { MarketScalarWhereInput } from "../inputs/MarketScalarWhereInput";
import { MarketUpdateManyMutationInput } from "../inputs/MarketUpdateManyMutationInput";

@TypeGraphQL.InputType("MarketUpdateManyWithWhereWithoutMarket_groupInput", {})
export class MarketUpdateManyWithWhereWithoutMarket_groupInput {
  @TypeGraphQL.Field(_type => MarketScalarWhereInput, {
    nullable: false
  })
  where!: MarketScalarWhereInput;

  @TypeGraphQL.Field(_type => MarketUpdateManyMutationInput, {
    nullable: false
  })
  data!: MarketUpdateManyMutationInput;
}
