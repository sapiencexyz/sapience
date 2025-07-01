import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { PositionOrderByWithRelationInput } from "../../../inputs/PositionOrderByWithRelationInput";
import { PositionWhereInput } from "../../../inputs/PositionWhereInput";
import { PositionWhereUniqueInput } from "../../../inputs/PositionWhereUniqueInput";
import { PositionScalarFieldEnum } from "../../../../enums/PositionScalarFieldEnum";

@TypeGraphQL.ArgsType()
export class FindFirstPositionArgs {
  @TypeGraphQL.Field(_type => PositionWhereInput, {
    nullable: true
  })
  where?: PositionWhereInput | undefined;

  @TypeGraphQL.Field(_type => [PositionOrderByWithRelationInput], {
    nullable: true
  })
  orderBy?: PositionOrderByWithRelationInput[] | undefined;

  @TypeGraphQL.Field(_type => PositionWhereUniqueInput, {
    nullable: true
  })
  cursor?: PositionWhereUniqueInput | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  take?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  skip?: number | undefined;

  @TypeGraphQL.Field(_type => [PositionScalarFieldEnum], {
    nullable: true
  })
  distinct?: Array<"id" | "createdAt" | "positionId" | "owner" | "isLP" | "highPriceTick" | "lowPriceTick" | "isSettled" | "lpBaseToken" | "lpQuoteToken" | "baseToken" | "quoteToken" | "borrowedBaseToken" | "borrowedQuoteToken" | "collateral" | "marketId"> | undefined;
}
