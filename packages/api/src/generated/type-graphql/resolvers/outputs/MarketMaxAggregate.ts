import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";

@TypeGraphQL.ObjectType("MarketMaxAggregate", {})
export class MarketMaxAggregate {
  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  id!: number | null;

  @TypeGraphQL.Field(_type => Date, {
    nullable: true
  })
  createdAt!: Date | null;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  marketId!: number | null;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  startTimestamp!: number | null;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  endTimestamp!: number | null;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  startingSqrtPriceX96!: Prisma.Decimal | null;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  settlementPriceD18!: Prisma.Decimal | null;

  @TypeGraphQL.Field(_type => Boolean, {
    nullable: true
  })
  settled!: boolean | null;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  baseAssetMinPriceTick!: number | null;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  baseAssetMaxPriceTick!: number | null;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  minPriceD18!: Prisma.Decimal | null;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  maxPriceD18!: Prisma.Decimal | null;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  marketGroupId!: number | null;

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
  public!: boolean | null;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  question!: string | null;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  poolAddress!: string | null;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  optionName!: string | null;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  rules!: string | null;
}
