import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Render_jobUpdateInput } from "../../../inputs/Render_jobUpdateInput";
import { Render_jobWhereUniqueInput } from "../../../inputs/Render_jobWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class UpdateOneRender_jobArgs {
  @TypeGraphQL.Field(_type => Render_jobUpdateInput, {
    nullable: false
  })
  data!: Render_jobUpdateInput;

  @TypeGraphQL.Field(_type => Render_jobWhereUniqueInput, {
    nullable: false
  })
  where!: Render_jobWhereUniqueInput;
}
