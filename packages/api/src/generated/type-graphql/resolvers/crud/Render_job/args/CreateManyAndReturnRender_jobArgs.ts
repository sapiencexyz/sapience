import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Render_jobCreateManyInput } from "../../../inputs/Render_jobCreateManyInput";

@TypeGraphQL.ArgsType()
export class CreateManyAndReturnRender_jobArgs {
  @TypeGraphQL.Field(_type => [Render_jobCreateManyInput], {
    nullable: false
  })
  data!: Render_jobCreateManyInput[];

  @TypeGraphQL.Field(_type => Boolean, {
    nullable: true
  })
  skipDuplicates?: boolean | undefined;
}
