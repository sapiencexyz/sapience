import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Cache_paramAvgAggregate } from "../outputs/Cache_paramAvgAggregate";
import { Cache_paramCountAggregate } from "../outputs/Cache_paramCountAggregate";
import { Cache_paramMaxAggregate } from "../outputs/Cache_paramMaxAggregate";
import { Cache_paramMinAggregate } from "../outputs/Cache_paramMinAggregate";
import { Cache_paramSumAggregate } from "../outputs/Cache_paramSumAggregate";

@TypeGraphQL.ObjectType("AggregateCache_param", {})
export class AggregateCache_param {
  @TypeGraphQL.Field(_type => Cache_paramCountAggregate, {
    nullable: true
  })
  _count!: Cache_paramCountAggregate | null;

  @TypeGraphQL.Field(_type => Cache_paramAvgAggregate, {
    nullable: true
  })
  _avg!: Cache_paramAvgAggregate | null;

  @TypeGraphQL.Field(_type => Cache_paramSumAggregate, {
    nullable: true
  })
  _sum!: Cache_paramSumAggregate | null;

  @TypeGraphQL.Field(_type => Cache_paramMinAggregate, {
    nullable: true
  })
  _min!: Cache_paramMinAggregate | null;

  @TypeGraphQL.Field(_type => Cache_paramMaxAggregate, {
    nullable: true
  })
  _max!: Cache_paramMaxAggregate | null;
}
