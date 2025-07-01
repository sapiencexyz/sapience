import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Market_groupOrderByWithRelationInput } from "../../../inputs/Market_groupOrderByWithRelationInput";
import { Market_groupWhereInput } from "../../../inputs/Market_groupWhereInput";
import { Market_groupWhereUniqueInput } from "../../../inputs/Market_groupWhereUniqueInput";
import { Market_groupScalarFieldEnum } from "../../../../enums/Market_groupScalarFieldEnum";

@TypeGraphQL.ArgsType()
export class FindFirstMarket_groupOrThrowArgs {
  @TypeGraphQL.Field(_type => Market_groupWhereInput, {
    nullable: true
  })
  where?: Market_groupWhereInput | undefined;

  @TypeGraphQL.Field(_type => [Market_groupOrderByWithRelationInput], {
    nullable: true
  })
  orderBy?: Market_groupOrderByWithRelationInput[] | undefined;

  @TypeGraphQL.Field(_type => Market_groupWhereUniqueInput, {
    nullable: true
  })
  cursor?: Market_groupWhereUniqueInput | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  take?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  skip?: number | undefined;

  @TypeGraphQL.Field(_type => [Market_groupScalarFieldEnum], {
    nullable: true
  })
  distinct?: Array<"id" | "createdAt" | "address" | "vaultAddress" | "isYin" | "chainId" | "deployTimestamp" | "deployTxnBlockNumber" | "owner" | "collateralAsset" | "resourceId" | "marketParamsFeerate" | "marketParamsAssertionliveness" | "marketParamsBondcurrency" | "marketParamsBondamount" | "marketParamsClaimstatement" | "marketParamsUniswappositionmanager" | "marketParamsUniswapswaprouter" | "marketParamsUniswapquoter" | "marketParamsOptimisticoraclev3" | "isCumulative" | "categoryId" | "question" | "baseTokenName" | "quoteTokenName" | "collateralDecimals" | "collateralSymbol" | "initializationNonce" | "factoryAddress" | "minTradeSize"> | undefined;
}
