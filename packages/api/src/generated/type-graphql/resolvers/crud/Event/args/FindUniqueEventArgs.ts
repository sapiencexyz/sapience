import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { EventWhereUniqueInput } from "../../../inputs/EventWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class FindUniqueEventArgs {
  @TypeGraphQL.Field(_type => EventWhereUniqueInput, {
    nullable: false
  })
  where!: EventWhereUniqueInput;
}
