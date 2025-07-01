import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { PositionCreateInput } from "../../../inputs/PositionCreateInput";
import { PositionUpdateInput } from "../../../inputs/PositionUpdateInput";
import { PositionWhereUniqueInput } from "../../../inputs/PositionWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class UpsertOnePositionArgs {
  @TypeGraphQL.Field(_type => PositionWhereUniqueInput, {
    nullable: false
  })
  where!: PositionWhereUniqueInput;

  @TypeGraphQL.Field(_type => PositionCreateInput, {
    nullable: false
  })
  create!: PositionCreateInput;

  @TypeGraphQL.Field(_type => PositionUpdateInput, {
    nullable: false
  })
  update!: PositionUpdateInput;
}
