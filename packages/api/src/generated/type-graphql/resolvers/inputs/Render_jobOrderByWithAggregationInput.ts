import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Render_jobAvgOrderByAggregateInput } from "../inputs/Render_jobAvgOrderByAggregateInput";
import { Render_jobCountOrderByAggregateInput } from "../inputs/Render_jobCountOrderByAggregateInput";
import { Render_jobMaxOrderByAggregateInput } from "../inputs/Render_jobMaxOrderByAggregateInput";
import { Render_jobMinOrderByAggregateInput } from "../inputs/Render_jobMinOrderByAggregateInput";
import { Render_jobSumOrderByAggregateInput } from "../inputs/Render_jobSumOrderByAggregateInput";
import { SortOrder } from "../../enums/SortOrder";

@TypeGraphQL.InputType("Render_jobOrderByWithAggregationInput", {})
export class Render_jobOrderByWithAggregationInput {
  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  id?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  createdAt?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  jobId?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  serviceId?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => Render_jobCountOrderByAggregateInput, {
    nullable: true
  })
  _count?: Render_jobCountOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => Render_jobAvgOrderByAggregateInput, {
    nullable: true
  })
  _avg?: Render_jobAvgOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => Render_jobMaxOrderByAggregateInput, {
    nullable: true
  })
  _max?: Render_jobMaxOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => Render_jobMinOrderByAggregateInput, {
    nullable: true
  })
  _min?: Render_jobMinOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => Render_jobSumOrderByAggregateInput, {
    nullable: true
  })
  _sum?: Render_jobSumOrderByAggregateInput | undefined;
}
