import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";

@TypeGraphQL.ObjectType("Market_groupMinAggregate", {})
export class Market_groupMinAggregate {
  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  id!: number | null;

  @TypeGraphQL.Field(_type => Date, {
    nullable: true
  })
  createdAt!: Date | null;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  address!: string | null;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  vaultAddress!: string | null;

  @TypeGraphQL.Field(_type => Boolean, {
    nullable: true
  })
  isYin!: boolean | null;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  chainId!: number | null;

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
    nullable: true
  })
  isCumulative!: boolean | null;

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
}
