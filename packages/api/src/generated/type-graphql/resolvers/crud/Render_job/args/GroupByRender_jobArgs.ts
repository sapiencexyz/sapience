import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Render_jobOrderByWithAggregationInput } from "../../../inputs/Render_jobOrderByWithAggregationInput";
import { Render_jobScalarWhereWithAggregatesInput } from "../../../inputs/Render_jobScalarWhereWithAggregatesInput";
import { Render_jobWhereInput } from "../../../inputs/Render_jobWhereInput";
import { Render_jobScalarFieldEnum } from "../../../../enums/Render_jobScalarFieldEnum";

@TypeGraphQL.ArgsType()
export class GroupByRender_jobArgs {
  @TypeGraphQL.Field(_type => Render_jobWhereInput, {
    nullable: true
  })
  where?: Render_jobWhereInput | undefined;

  @TypeGraphQL.Field(_type => [Render_jobOrderByWithAggregationInput], {
    nullable: true
  })
  orderBy?: Render_jobOrderByWithAggregationInput[] | undefined;

  @TypeGraphQL.Field(_type => [Render_jobScalarFieldEnum], {
    nullable: false
  })
  by!: Array<"id" | "createdAt" | "jobId" | "serviceId">;

  @TypeGraphQL.Field(_type => Render_jobScalarWhereWithAggregatesInput, {
    nullable: true
  })
  having?: Render_jobScalarWhereWithAggregatesInput | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  take?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  skip?: number | undefined;
}
