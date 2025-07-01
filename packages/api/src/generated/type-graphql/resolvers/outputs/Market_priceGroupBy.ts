import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_priceAvgAggregate } from "../outputs/Market_priceAvgAggregate";
import { Market_priceCountAggregate } from "../outputs/Market_priceCountAggregate";
import { Market_priceMaxAggregate } from "../outputs/Market_priceMaxAggregate";
import { Market_priceMinAggregate } from "../outputs/Market_priceMinAggregate";
import { Market_priceSumAggregate } from "../outputs/Market_priceSumAggregate";

@TypeGraphQL.ObjectType("Market_priceGroupBy", {})
export class Market_priceGroupBy {
  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: false
  })
  id!: number;

  @TypeGraphQL.Field(_type => Date, {
    nullable: false
  })
  createdAt!: Date;

  @TypeGraphQL.Field(_type => GraphQLScalars.BigIntResolver, {
    nullable: false
  })
  timestamp!: bigint;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: false
  })
  value!: Prisma.Decimal;

  @TypeGraphQL.Field(_type => Market_priceCountAggregate, {
    nullable: true
  })
  _count!: Market_priceCountAggregate | null;

  @TypeGraphQL.Field(_type => Market_priceAvgAggregate, {
    nullable: true
  })
  _avg!: Market_priceAvgAggregate | null;

  @TypeGraphQL.Field(_type => Market_priceSumAggregate, {
    nullable: true
  })
  _sum!: Market_priceSumAggregate | null;

  @TypeGraphQL.Field(_type => Market_priceMinAggregate, {
    nullable: true
  })
  _min!: Market_priceMinAggregate | null;

  @TypeGraphQL.Field(_type => Market_priceMaxAggregate, {
    nullable: true
  })
  _max!: Market_priceMaxAggregate | null;
}
