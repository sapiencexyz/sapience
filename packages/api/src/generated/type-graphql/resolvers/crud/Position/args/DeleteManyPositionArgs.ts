import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { PositionWhereInput } from "../../../inputs/PositionWhereInput";

@TypeGraphQL.ArgsType()
export class DeleteManyPositionArgs {
  @TypeGraphQL.Field(_type => PositionWhereInput, {
    nullable: true
  })
  where?: PositionWhereInput | undefined;
}
