import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Render_jobCreateInput } from "../../../inputs/Render_jobCreateInput";

@TypeGraphQL.ArgsType()
export class CreateOneRender_jobArgs {
  @TypeGraphQL.Field(_type => Render_jobCreateInput, {
    nullable: false
  })
  data!: Render_jobCreateInput;
}
