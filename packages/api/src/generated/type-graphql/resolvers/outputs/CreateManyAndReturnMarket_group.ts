import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { CreateManyAndReturnMarket_groupCategoryArgs } from "./args/CreateManyAndReturnMarket_groupCategoryArgs";
import { CreateManyAndReturnMarket_groupResourceArgs } from "./args/CreateManyAndReturnMarket_groupResourceArgs";
import { Category } from "../../models/Category";
import { Resource } from "../../models/Resource";

@TypeGraphQL.ObjectType("CreateManyAndReturnMarket_group", {})
export class CreateManyAndReturnMarket_group {
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

  resource!: Resource | null;
  category!: Category | null;

  @TypeGraphQL.Field(_type => Resource, {
    name: "resource",
    nullable: true
  })
  getResource(@TypeGraphQL.Root() root: CreateManyAndReturnMarket_group, @TypeGraphQL.Args() args: CreateManyAndReturnMarket_groupResourceArgs): Resource | null {
    return root.resource;
  }

  @TypeGraphQL.Field(_type => Category, {
    name: "category",
    nullable: true
  })
  getCategory(@TypeGraphQL.Root() root: CreateManyAndReturnMarket_group, @TypeGraphQL.Args() args: CreateManyAndReturnMarket_groupCategoryArgs): Category | null {
    return root.category;
  }
}
