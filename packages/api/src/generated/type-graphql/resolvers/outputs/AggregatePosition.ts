import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { PositionAvgAggregate } from "../outputs/PositionAvgAggregate";
import { PositionCountAggregate } from "../outputs/PositionCountAggregate";
import { PositionMaxAggregate } from "../outputs/PositionMaxAggregate";
import { PositionMinAggregate } from "../outputs/PositionMinAggregate";
import { PositionSumAggregate } from "../outputs/PositionSumAggregate";

@TypeGraphQL.ObjectType("AggregatePosition", {})
export class AggregatePosition {
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
