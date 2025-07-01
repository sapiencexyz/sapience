import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { PositionCreateInput } from "../../../inputs/PositionCreateInput";

@TypeGraphQL.ArgsType()
export class CreateOnePositionArgs {
  @TypeGraphQL.Field(_type => PositionCreateInput, {
    nullable: false
  })
  data!: PositionCreateInput;
}
