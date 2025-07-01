import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_groupAvgAggregate } from "../outputs/Market_groupAvgAggregate";
import { Market_groupCountAggregate } from "../outputs/Market_groupCountAggregate";
import { Market_groupMaxAggregate } from "../outputs/Market_groupMaxAggregate";
import { Market_groupMinAggregate } from "../outputs/Market_groupMinAggregate";
import { Market_groupSumAggregate } from "../outputs/Market_groupSumAggregate";

@TypeGraphQL.ObjectType("AggregateMarket_group", {})
export class AggregateMarket_group {
  @TypeGraphQL.Field(_type => Market_groupCountAggregate, {
    nullable: true
  })
  _count!: Market_groupCountAggregate | null;

  @TypeGraphQL.Field(_type => Market_groupAvgAggregate, {
    nullable: true
  })
  _avg!: Market_groupAvgAggregate | null;

  @TypeGraphQL.Field(_type => Market_groupSumAggregate, {
    nullable: true
  })
  _sum!: Market_groupSumAggregate | null;

  @TypeGraphQL.Field(_type => Market_groupMinAggregate, {
    nullable: true
  })
  _min!: Market_groupMinAggregate | null;

  @TypeGraphQL.Field(_type => Market_groupMaxAggregate, {
    nullable: true
  })
  _max!: Market_groupMaxAggregate | null;
}
