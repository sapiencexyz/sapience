import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Market_groupOrderByWithAggregationInput } from "../../../inputs/Market_groupOrderByWithAggregationInput";
import { Market_groupScalarWhereWithAggregatesInput } from "../../../inputs/Market_groupScalarWhereWithAggregatesInput";
import { Market_groupWhereInput } from "../../../inputs/Market_groupWhereInput";
import { Market_groupScalarFieldEnum } from "../../../../enums/Market_groupScalarFieldEnum";

@TypeGraphQL.ArgsType()
export class GroupByMarket_groupArgs {
  @TypeGraphQL.Field(_type => Market_groupWhereInput, {
    nullable: true
  })
  where?: Market_groupWhereInput | undefined;

  @TypeGraphQL.Field(_type => [Market_groupOrderByWithAggregationInput], {
    nullable: true
  })
  orderBy?: Market_groupOrderByWithAggregationInput[] | undefined;

  @TypeGraphQL.Field(_type => [Market_groupScalarFieldEnum], {
    nullable: false
  })
  by!: Array<"id" | "createdAt" | "address" | "vaultAddress" | "isYin" | "chainId" | "deployTimestamp" | "deployTxnBlockNumber" | "owner" | "collateralAsset" | "resourceId" | "marketParamsFeerate" | "marketParamsAssertionliveness" | "marketParamsBondcurrency" | "marketParamsBondamount" | "marketParamsClaimstatement" | "marketParamsUniswappositionmanager" | "marketParamsUniswapswaprouter" | "marketParamsUniswapquoter" | "marketParamsOptimisticoraclev3" | "isCumulative" | "categoryId" | "question" | "baseTokenName" | "quoteTokenName" | "collateralDecimals" | "collateralSymbol" | "initializationNonce" | "factoryAddress" | "minTradeSize">;

  @TypeGraphQL.Field(_type => Market_groupScalarWhereWithAggregatesInput, {
    nullable: true
  })
  having?: Market_groupScalarWhereWithAggregatesInput | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  take?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  skip?: number | undefined;
}
