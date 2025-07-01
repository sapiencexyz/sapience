import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_groupAvgAggregate } from "../outputs/Market_groupAvgAggregate";
import { Market_groupCountAggregate } from "../outputs/Market_groupCountAggregate";
import { Market_groupMaxAggregate } from "../outputs/Market_groupMaxAggregate";
import { Market_groupMinAggregate } from "../outputs/Market_groupMinAggregate";
import { Market_groupSumAggregate } from "../outputs/Market_groupSumAggregate";

@TypeGraphQL.ObjectType("Market_groupGroupBy", {})
export class Market_groupGroupBy {
  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: false
  })
  id!: number;

  @TypeGraphQL.Field(_type => Date, {
    nullable: false
  })
  createdAt!: Date;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  address!: string | null;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  vaultAddress!: string | null;

  @TypeGraphQL.Field(_type => Boolean, {
    nullable: false
  })
  isYin!: boolean;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: false
  })
  chainId!: number;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  deployTimestamp!: number | null;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  deployTxnBlockNumber!: number | null;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  owner!: string | null;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  collateralAsset!: string | null;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  resourceId!: number | null;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  marketParamsFeerate!: number | null;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  marketParamsAssertionliveness!: Prisma.Decimal | null;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  marketParamsBondcurrency!: string | null;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  marketParamsBondamount!: Prisma.Decimal | null;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  marketParamsClaimstatement!: string | null;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  marketParamsUniswappositionmanager!: string | null;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  marketParamsUniswapswaprouter!: string | null;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  marketParamsUniswapquoter!: string | null;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  marketParamsOptimisticoraclev3!: string | null;

  @TypeGraphQL.Field(_type => Boolean, {
    nullable: false
  })
  isCumulative!: boolean;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  categoryId!: number | null;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  question!: string | null;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  baseTokenName!: string | null;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  quoteTokenName!: string | null;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  collateralDecimals!: number | null;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  collateralSymbol!: string | null;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  initializationNonce!: string | null;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  factoryAddress!: string | null;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  minTradeSize!: Prisma.Decimal | null;

  @TypeGraphQL.Field(_type => Market_groupCountAggregate, {
    nullable: true
  })
  _count!: Market_groupCountAggregate | null;

  @TypeGraphQL.Field(_type => Market_groupAvgAggregate, {
    nullable: true
  })
  _avg!: Market_groupAvgAggregate | null;

  @TypeGraphQL.Field(_type => Market_groupSumAggregate, {
    nullable: true
  })
  _sum!: Market_groupSumAggregate | null;

  @TypeGraphQL.Field(_type => Market_groupMinAggregate, {
    nullable: true
  })
  _min!: Market_groupMinAggregate | null;

  @TypeGraphQL.Field(_type => Market_groupMaxAggregate, {
    nullable: true
  })
  _max!: Market_groupMaxAggregate | null;
}
