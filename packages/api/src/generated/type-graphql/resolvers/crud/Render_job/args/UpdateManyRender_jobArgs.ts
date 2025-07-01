import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Render_jobUpdateManyMutationInput } from "../../../inputs/Render_jobUpdateManyMutationInput";
import { Render_jobWhereInput } from "../../../inputs/Render_jobWhereInput";

@TypeGraphQL.ArgsType()
export class UpdateManyRender_jobArgs {
  @TypeGraphQL.Field(_type => Render_jobUpdateManyMutationInput, {
    nullable: false
  })
  data!: Render_jobUpdateManyMutationInput;

  @TypeGraphQL.Field(_type => Render_jobWhereInput, {
    nullable: true
  })
  where?: Render_jobWhereInput | undefined;
}
