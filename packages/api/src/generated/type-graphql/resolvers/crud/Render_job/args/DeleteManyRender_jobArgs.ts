import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Render_jobWhereInput } from "../../../inputs/Render_jobWhereInput";

@TypeGraphQL.ArgsType()
export class DeleteManyRender_jobArgs {
  @TypeGraphQL.Field(_type => Render_jobWhereInput, {
    nullable: true
  })
  where?: Render_jobWhereInput | undefined;
}
