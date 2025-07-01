import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { PositionUpdateInput } from "../../../inputs/PositionUpdateInput";
import { PositionWhereUniqueInput } from "../../../inputs/PositionWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class UpdateOnePositionArgs {
  @TypeGraphQL.Field(_type => PositionUpdateInput, {
    nullable: false
  })
  data!: PositionUpdateInput;

  @TypeGraphQL.Field(_type => PositionWhereUniqueInput, {
    nullable: false
  })
  where!: PositionWhereUniqueInput;
}
