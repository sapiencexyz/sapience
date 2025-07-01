import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Render_jobAvgAggregate } from "../outputs/Render_jobAvgAggregate";
import { Render_jobCountAggregate } from "../outputs/Render_jobCountAggregate";
import { Render_jobMaxAggregate } from "../outputs/Render_jobMaxAggregate";
import { Render_jobMinAggregate } from "../outputs/Render_jobMinAggregate";
import { Render_jobSumAggregate } from "../outputs/Render_jobSumAggregate";

@TypeGraphQL.ObjectType("AggregateRender_job", {})
export class AggregateRender_job {
  @TypeGraphQL.Field(_type => Render_jobCountAggregate, {
    nullable: true
  })
  _count!: Render_jobCountAggregate | null;

  @TypeGraphQL.Field(_type => Render_jobAvgAggregate, {
    nullable: true
  })
  _avg!: Render_jobAvgAggregate | null;

  @TypeGraphQL.Field(_type => Render_jobSumAggregate, {
    nullable: true
  })
  _sum!: Render_jobSumAggregate | null;

  @TypeGraphQL.Field(_type => Render_jobMinAggregate, {
    nullable: true
  })
  _min!: Render_jobMinAggregate | null;

  @TypeGraphQL.Field(_type => Render_jobMaxAggregate, {
    nullable: true
  })
  _max!: Render_jobMaxAggregate | null;
}
