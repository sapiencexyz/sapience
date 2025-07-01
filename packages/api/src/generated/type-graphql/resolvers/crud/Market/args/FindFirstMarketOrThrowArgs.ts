import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { MarketOrderByWithRelationInput } from "../../../inputs/MarketOrderByWithRelationInput";
import { MarketWhereInput } from "../../../inputs/MarketWhereInput";
import { MarketWhereUniqueInput } from "../../../inputs/MarketWhereUniqueInput";
import { MarketScalarFieldEnum } from "../../../../enums/MarketScalarFieldEnum";

@TypeGraphQL.ArgsType()
export class FindFirstMarketOrThrowArgs {
  @TypeGraphQL.Field(_type => MarketWhereInput, {
    nullable: true
  })
  where?: MarketWhereInput | undefined;

  @TypeGraphQL.Field(_type => [MarketOrderByWithRelationInput], {
    nullable: true
  })
  orderBy?: MarketOrderByWithRelationInput[] | undefined;

  @TypeGraphQL.Field(_type => MarketWhereUniqueInput, {
    nullable: true
  })
  cursor?: MarketWhereUniqueInput | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  take?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  skip?: number | undefined;

  @TypeGraphQL.Field(_type => [MarketScalarFieldEnum], {
    nullable: true
  })
  distinct?: Array<"id" | "createdAt" | "marketId" | "startTimestamp" | "endTimestamp" | "startingSqrtPriceX96" | "settlementPriceD18" | "settled" | "baseAssetMinPriceTick" | "baseAssetMaxPriceTick" | "minPriceD18" | "maxPriceD18" | "marketGroupId" | "marketParamsFeerate" | "marketParamsAssertionliveness" | "marketParamsBondcurrency" | "marketParamsBondamount" | "marketParamsClaimstatement" | "marketParamsUniswappositionmanager" | "marketParamsUniswapswaprouter" | "marketParamsUniswapquoter" | "marketParamsOptimisticoraclev3" | "public" | "question" | "poolAddress" | "optionName" | "rules"> | undefined;
}
