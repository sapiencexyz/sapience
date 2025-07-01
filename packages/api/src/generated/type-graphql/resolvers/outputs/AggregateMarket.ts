import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { MarketAvgAggregate } from "../outputs/MarketAvgAggregate";
import { MarketCountAggregate } from "../outputs/MarketCountAggregate";
import { MarketMaxAggregate } from "../outputs/MarketMaxAggregate";
import { MarketMinAggregate } from "../outputs/MarketMinAggregate";
import { MarketSumAggregate } from "../outputs/MarketSumAggregate";

@TypeGraphQL.ObjectType("AggregateMarket", {})
export class AggregateMarket {
  @TypeGraphQL.Field(_type => MarketCountAggregate, {
    nullable: true
  })
  _count!: MarketCountAggregate | null;

  @TypeGraphQL.Field(_type => MarketAvgAggregate, {
    nullable: true
  })
  _avg!: MarketAvgAggregate | null;

  @TypeGraphQL.Field(_type => MarketSumAggregate, {
    nullable: true
  })
  _sum!: MarketSumAggregate | null;

  @TypeGraphQL.Field(_type => MarketMinAggregate, {
    nullable: true
  })
  _min!: MarketMinAggregate | null;

  @TypeGraphQL.Field(_type => MarketMaxAggregate, {
    nullable: true
  })
  _max!: MarketMaxAggregate | null;
}
