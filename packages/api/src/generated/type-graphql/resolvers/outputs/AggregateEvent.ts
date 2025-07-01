import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { EventAvgAggregate } from "../outputs/EventAvgAggregate";
import { EventCountAggregate } from "../outputs/EventCountAggregate";
import { EventMaxAggregate } from "../outputs/EventMaxAggregate";
import { EventMinAggregate } from "../outputs/EventMinAggregate";
import { EventSumAggregate } from "../outputs/EventSumAggregate";

@TypeGraphQL.ObjectType("AggregateEvent", {})
export class AggregateEvent {
  @TypeGraphQL.Field(_type => EventCountAggregate, {
    nullable: true
  })
  _count!: EventCountAggregate | null;

  @TypeGraphQL.Field(_type => EventAvgAggregate, {
    nullable: true
  })
  _avg!: EventAvgAggregate | null;

  @TypeGraphQL.Field(_type => EventSumAggregate, {
    nullable: true
  })
  _sum!: EventSumAggregate | null;

  @TypeGraphQL.Field(_type => EventMinAggregate, {
    nullable: true
  })
  _min!: EventMinAggregate | null;

  @TypeGraphQL.Field(_type => EventMaxAggregate, {
    nullable: true
  })
  _max!: EventMaxAggregate | null;
}
