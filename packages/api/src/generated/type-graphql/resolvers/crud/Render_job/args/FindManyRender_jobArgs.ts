import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Render_jobOrderByWithRelationInput } from "../../../inputs/Render_jobOrderByWithRelationInput";
import { Render_jobWhereInput } from "../../../inputs/Render_jobWhereInput";
import { Render_jobWhereUniqueInput } from "../../../inputs/Render_jobWhereUniqueInput";
import { Render_jobScalarFieldEnum } from "../../../../enums/Render_jobScalarFieldEnum";

@TypeGraphQL.ArgsType()
export class FindManyRender_jobArgs {
  @TypeGraphQL.Field(_type => Render_jobWhereInput, {
    nullable: true
  })
  where?: Render_jobWhereInput | undefined;

  @TypeGraphQL.Field(_type => [Render_jobOrderByWithRelationInput], {
    nullable: true
  })
  orderBy?: Render_jobOrderByWithRelationInput[] | undefined;

  @TypeGraphQL.Field(_type => Render_jobWhereUniqueInput, {
    nullable: true
  })
  cursor?: Render_jobWhereUniqueInput | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  take?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  skip?: number | undefined;

  @TypeGraphQL.Field(_type => [Render_jobScalarFieldEnum], {
    nullable: true
  })
  distinct?: Array<"id" | "createdAt" | "jobId" | "serviceId"> | undefined;
}
