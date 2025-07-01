import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Cache_candleAvgAggregate } from "../outputs/Cache_candleAvgAggregate";
import { Cache_candleCountAggregate } from "../outputs/Cache_candleCountAggregate";
import { Cache_candleMaxAggregate } from "../outputs/Cache_candleMaxAggregate";
import { Cache_candleMinAggregate } from "../outputs/Cache_candleMinAggregate";
import { Cache_candleSumAggregate } from "../outputs/Cache_candleSumAggregate";

@TypeGraphQL.ObjectType("Cache_candleGroupBy", {})
export class Cache_candleGroupBy {
  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: false
  })
  id!: number;

  @TypeGraphQL.Field(_type => Date, {
    nullable: false
  })
  createdAt!: Date;

  @TypeGraphQL.Field(_type => String, {
    nullable: false
  })
  candleType!: string;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: false
  })
  interval!: number;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  trailingAvgTime!: number | null;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  resourceSlug!: string | null;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  marketIdx!: number | null;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: false
  })
  timestamp!: number;

  @TypeGraphQL.Field(_type => String, {
    nullable: false
  })
  open!: string;

  @TypeGraphQL.Field(_type => String, {
    nullable: false
  })
  high!: string;

  @TypeGraphQL.Field(_type => String, {
    nullable: false
  })
  low!: string;

  @TypeGraphQL.Field(_type => String, {
    nullable: false
  })
  close!: string;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: false
  })
  endTimestamp!: number;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: false
  })
  lastUpdatedTimestamp!: number;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  sumUsed!: Prisma.Decimal | null;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  sumFeePaid!: Prisma.Decimal | null;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  trailingStartTimestamp!: number | null;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  address!: string | null;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  chainId!: number | null;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  marketId!: number | null;

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
