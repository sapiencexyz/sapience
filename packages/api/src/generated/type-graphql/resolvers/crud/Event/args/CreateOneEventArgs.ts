import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { EventCreateInput } from "../../../inputs/EventCreateInput";

@TypeGraphQL.ArgsType()
export class CreateOneEventArgs {
  @TypeGraphQL.Field(_type => EventCreateInput, {
    nullable: false
  })
  data!: EventCreateInput;
}
