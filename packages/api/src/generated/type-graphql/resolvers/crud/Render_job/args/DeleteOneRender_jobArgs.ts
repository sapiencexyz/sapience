import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Render_jobWhereUniqueInput } from "../../../inputs/Render_jobWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class DeleteOneRender_jobArgs {
  @TypeGraphQL.Field(_type => Render_jobWhereUniqueInput, {
    nullable: false
  })
  where!: Render_jobWhereUniqueInput;
}
