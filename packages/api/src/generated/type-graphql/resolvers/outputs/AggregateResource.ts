import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { ResourceAvgAggregate } from "../outputs/ResourceAvgAggregate";
import { ResourceCountAggregate } from "../outputs/ResourceCountAggregate";
import { ResourceMaxAggregate } from "../outputs/ResourceMaxAggregate";
import { ResourceMinAggregate } from "../outputs/ResourceMinAggregate";
import { ResourceSumAggregate } from "../outputs/ResourceSumAggregate";

@TypeGraphQL.ObjectType("AggregateResource", {})
export class AggregateResource {
  @TypeGraphQL.Field(_type => ResourceCountAggregate, {
    nullable: true
  })
  _count!: ResourceCountAggregate | null;

  @TypeGraphQL.Field(_type => ResourceAvgAggregate, {
    nullable: true
  })
  _avg!: ResourceAvgAggregate | null;

  @TypeGraphQL.Field(_type => ResourceSumAggregate, {
    nullable: true
  })
  _sum!: ResourceSumAggregate | null;

  @TypeGraphQL.Field(_type => ResourceMinAggregate, {
    nullable: true
  })
  _min!: ResourceMinAggregate | null;

  @TypeGraphQL.Field(_type => ResourceMaxAggregate, {
    nullable: true
  })
  _max!: ResourceMaxAggregate | null;
}
