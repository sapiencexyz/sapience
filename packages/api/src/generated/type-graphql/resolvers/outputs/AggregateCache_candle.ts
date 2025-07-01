import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Cache_candleAvgAggregate } from "../outputs/Cache_candleAvgAggregate";
import { Cache_candleCountAggregate } from "../outputs/Cache_candleCountAggregate";
import { Cache_candleMaxAggregate } from "../outputs/Cache_candleMaxAggregate";
import { Cache_candleMinAggregate } from "../outputs/Cache_candleMinAggregate";
import { Cache_candleSumAggregate } from "../outputs/Cache_candleSumAggregate";

@TypeGraphQL.ObjectType("AggregateCache_candle", {})
export class AggregateCache_candle {
  @TypeGraphQL.Field(_type => Cache_candleCountAggregate, {
    nullable: true
  })
  _count!: Cache_candleCountAggregate | null;

  @TypeGraphQL.Field(_type => Cache_candleAvgAggregate, {
    nullable: true
  })
  _avg!: Cache_candleAvgAggregate | null;

  @TypeGraphQL.Field(_type => Cache_candleSumAggregate, {
    nullable: true
  })
  _sum!: Cache_candleSumAggregate | null;

  @TypeGraphQL.Field(_type => Cache_candleMinAggregate, {
    nullable: true
  })
  _min!: Cache_candleMinAggregate | null;

  @TypeGraphQL.Field(_type => Cache_candleMaxAggregate, {
    nullable: true
  })
  _max!: Cache_candleMaxAggregate | null;
}
