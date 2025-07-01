import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { CreateManyAndReturnPositionMarketArgs } from "./args/CreateManyAndReturnPositionMarketArgs";
import { Market } from "../../models/Market";

@TypeGraphQL.ObjectType("CreateManyAndReturnPosition", {})
export class CreateManyAndReturnPosition {
  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: false
  })
  id!: number;

  @TypeGraphQL.Field(_type => Date, {
    nullable: false
  })
  createdAt!: Date;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: false
  })
  positionId!: number;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  owner!: string | null;

  @TypeGraphQL.Field(_type => Boolean, {
    nullable: false
  })
  isLP!: boolean;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  highPriceTick!: Prisma.Decimal | null;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  lowPriceTick!: Prisma.Decimal | null;

  @TypeGraphQL.Field(_type => Boolean, {
    nullable: true
  })
  isSettled!: boolean | null;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  lpBaseToken!: Prisma.Decimal | null;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  lpQuoteToken!: Prisma.Decimal | null;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  baseToken!: Prisma.Decimal | null;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  quoteToken!: Prisma.Decimal | null;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  borrowedBaseToken!: Prisma.Decimal | null;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  borrowedQuoteToken!: Prisma.Decimal | null;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: false
  })
  collateral!: Prisma.Decimal;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  marketId!: number | null;

  market!: Market | null;

  @TypeGraphQL.Field(_type => Market, {
    name: "market",
    nullable: true
  })
  getMarket(@TypeGraphQL.Root() root: CreateManyAndReturnPosition, @TypeGraphQL.Args() args: CreateManyAndReturnPositionMarketArgs): Market | null {
    return root.market;
  }
}
