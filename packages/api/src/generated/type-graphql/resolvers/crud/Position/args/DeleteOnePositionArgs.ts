import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { PositionWhereUniqueInput } from "../../../inputs/PositionWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class DeleteOnePositionArgs {
  @TypeGraphQL.Field(_type => PositionWhereUniqueInput, {
    nullable: false
  })
  where!: PositionWhereUniqueInput;
}
