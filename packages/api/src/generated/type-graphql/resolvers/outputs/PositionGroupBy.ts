import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { PositionAvgAggregate } from "../outputs/PositionAvgAggregate";
import { PositionCountAggregate } from "../outputs/PositionCountAggregate";
import { PositionMaxAggregate } from "../outputs/PositionMaxAggregate";
import { PositionMinAggregate } from "../outputs/PositionMinAggregate";
import { PositionSumAggregate } from "../outputs/PositionSumAggregate";

@TypeGraphQL.ObjectType("PositionGroupBy", {})
export class PositionGroupBy {
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

  @TypeGraphQL.Field(_type => PositionCountAggregate, {
    nullable: true
  })
  _count!: PositionCountAggregate | null;

  @TypeGraphQL.Field(_type => PositionAvgAggregate, {
    nullable: true
  })
  _avg!: PositionAvgAggregate | null;

  @TypeGraphQL.Field(_type => PositionSumAggregate, {
    nullable: true
  })
  _sum!: PositionSumAggregate | null;

  @TypeGraphQL.Field(_type => PositionMinAggregate, {
    nullable: true
  })
  _min!: PositionMinAggregate | null;

  @TypeGraphQL.Field(_type => PositionMaxAggregate, {
    nullable: true
  })
  _max!: PositionMaxAggregate | null;
}
