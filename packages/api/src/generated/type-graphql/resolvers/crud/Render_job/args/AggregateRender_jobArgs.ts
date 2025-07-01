import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Render_jobOrderByWithRelationInput } from "../../../inputs/Render_jobOrderByWithRelationInput";
import { Render_jobWhereInput } from "../../../inputs/Render_jobWhereInput";
import { Render_jobWhereUniqueInput } from "../../../inputs/Render_jobWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class AggregateRender_jobArgs {
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
}
