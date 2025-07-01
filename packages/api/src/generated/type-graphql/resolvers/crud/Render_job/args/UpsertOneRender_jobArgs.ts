import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Render_jobCreateInput } from "../../../inputs/Render_jobCreateInput";
import { Render_jobUpdateInput } from "../../../inputs/Render_jobUpdateInput";
import { Render_jobWhereUniqueInput } from "../../../inputs/Render_jobWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class UpsertOneRender_jobArgs {
  @TypeGraphQL.Field(_type => Render_jobWhereUniqueInput, {
    nullable: false
  })
  where!: Render_jobWhereUniqueInput;

  @TypeGraphQL.Field(_type => Render_jobCreateInput, {
    nullable: false
  })
  create!: Render_jobCreateInput;

  @TypeGraphQL.Field(_type => Render_jobUpdateInput, {
    nullable: false
  })
  update!: Render_jobUpdateInput;
}
