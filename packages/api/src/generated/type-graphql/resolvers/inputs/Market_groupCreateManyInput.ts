import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";

@TypeGraphQL.InputType("Market_groupCreateManyInput", {})
export class Market_groupCreateManyInput {
  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  id?: number | undefined;

  @TypeGraphQL.Field(_type => Date, {
    nullable: true
  })
  createdAt?: Date | undefined;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  address?: string | undefined;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  vaultAddress?: string | undefined;

  @TypeGraphQL.Field(_type => Boolean, {
    nullable: true
  })
  isYin?: boolean | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: false
  })
  chainId!: number;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  deployTimestamp?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  deployTxnBlockNumber?: number | undefined;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  owner?: string | undefined;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  collateralAsset?: string | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  resourceId?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  marketParamsFeerate?: number | undefined;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  marketParamsAssertionliveness?: Prisma.Decimal | undefined;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  marketParamsBondcurrency?: string | undefined;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  marketParamsBondamount?: Prisma.Decimal | undefined;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  marketParamsClaimstatement?: string | undefined;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  marketParamsUniswappositionmanager?: string | undefined;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  marketParamsUniswapswaprouter?: string | undefined;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  marketParamsUniswapquoter?: string | undefined;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  marketParamsOptimisticoraclev3?: string | undefined;

  @TypeGraphQL.Field(_type => Boolean, {
    nullable: true
  })
  isCumulative?: boolean | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  categoryId?: number | undefined;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  question?: string | undefined;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  baseTokenName?: string | undefined;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  quoteTokenName?: string | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  collateralDecimals?: number | undefined;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  collateralSymbol?: string | undefined;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  initializationNonce?: string | undefined;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  factoryAddress?: string | undefined;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  minTradeSize?: Prisma.Decimal | undefined;
}
