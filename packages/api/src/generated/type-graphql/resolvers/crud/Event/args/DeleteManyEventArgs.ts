import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { EventWhereInput } from "../../../inputs/EventWhereInput";

@TypeGraphQL.ArgsType()
export class DeleteManyEventArgs {
  @TypeGraphQL.Field(_type => EventWhereInput, {
    nullable: true
  })
  where?: EventWhereInput | undefined;
}
