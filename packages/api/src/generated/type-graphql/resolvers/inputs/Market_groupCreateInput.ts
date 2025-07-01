import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { CategoryCreateNestedOneWithoutMarket_groupInput } from "../inputs/CategoryCreateNestedOneWithoutMarket_groupInput";
import { EventCreateNestedManyWithoutMarket_groupInput } from "../inputs/EventCreateNestedManyWithoutMarket_groupInput";
import { MarketCreateNestedManyWithoutMarket_groupInput } from "../inputs/MarketCreateNestedManyWithoutMarket_groupInput";
import { ResourceCreateNestedOneWithoutMarket_groupInput } from "../inputs/ResourceCreateNestedOneWithoutMarket_groupInput";

@TypeGraphQL.InputType("Market_groupCreateInput", {})
export class Market_groupCreateInput {
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

  @TypeGraphQL.Field(_type => EventCreateNestedManyWithoutMarket_groupInput, {
    nullable: true
  })
  event?: EventCreateNestedManyWithoutMarket_groupInput | undefined;

  @TypeGraphQL.Field(_type => MarketCreateNestedManyWithoutMarket_groupInput, {
    nullable: true
  })
  market?: MarketCreateNestedManyWithoutMarket_groupInput | undefined;

  @TypeGraphQL.Field(_type => ResourceCreateNestedOneWithoutMarket_groupInput, {
    nullable: true
  })
  resource?: ResourceCreateNestedOneWithoutMarket_groupInput | undefined;

  @TypeGraphQL.Field(_type => CategoryCreateNestedOneWithoutMarket_groupInput, {
    nullable: true
  })
  category?: CategoryCreateNestedOneWithoutMarket_groupInput | undefined;
}
