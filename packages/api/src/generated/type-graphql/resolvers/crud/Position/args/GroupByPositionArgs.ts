import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { PositionOrderByWithAggregationInput } from "../../../inputs/PositionOrderByWithAggregationInput";
import { PositionScalarWhereWithAggregatesInput } from "../../../inputs/PositionScalarWhereWithAggregatesInput";
import { PositionWhereInput } from "../../../inputs/PositionWhereInput";
import { PositionScalarFieldEnum } from "../../../../enums/PositionScalarFieldEnum";

@TypeGraphQL.ArgsType()
export class GroupByPositionArgs {
  @TypeGraphQL.Field(_type => PositionWhereInput, {
    nullable: true
  })
  where?: PositionWhereInput | undefined;

  @TypeGraphQL.Field(_type => [PositionOrderByWithAggregationInput], {
    nullable: true
  })
  orderBy?: PositionOrderByWithAggregationInput[] | undefined;

  @TypeGraphQL.Field(_type => [PositionScalarFieldEnum], {
    nullable: false
  })
  by!: Array<"id" | "createdAt" | "positionId" | "owner" | "isLP" | "highPriceTick" | "lowPriceTick" | "isSettled" | "lpBaseToken" | "lpQuoteToken" | "baseToken" | "quoteToken" | "borrowedBaseToken" | "borrowedQuoteToken" | "collateral" | "marketId">;

  @TypeGraphQL.Field(_type => PositionScalarWhereWithAggregatesInput, {
    nullable: true
  })
  having?: PositionScalarWhereWithAggregatesInput | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  take?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  skip?: number | undefined;
}
