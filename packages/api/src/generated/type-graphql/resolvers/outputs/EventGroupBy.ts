import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { EventAvgAggregate } from "../outputs/EventAvgAggregate";
import { EventCountAggregate } from "../outputs/EventCountAggregate";
import { EventMaxAggregate } from "../outputs/EventMaxAggregate";
import { EventMinAggregate } from "../outputs/EventMinAggregate";
import { EventSumAggregate } from "../outputs/EventSumAggregate";

@TypeGraphQL.ObjectType("EventGroupBy", {})
export class EventGroupBy {
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
  blockNumber!: number;

  @TypeGraphQL.Field(_type => String, {
    nullable: false
  })
  transactionHash!: string;

  @TypeGraphQL.Field(_type => GraphQLScalars.BigIntResolver, {
    nullable: false
  })
  timestamp!: bigint;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: false
  })
  logIndex!: number;

  @TypeGraphQL.Field(_type => GraphQLScalars.JSONResolver, {
    nullable: false
  })
  logData!: Prisma.JsonValue;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  marketGroupId!: number | null;

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
