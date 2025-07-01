import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { EventUpdateInput } from "../../../inputs/EventUpdateInput";
import { EventWhereUniqueInput } from "../../../inputs/EventWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class UpdateOneEventArgs {
  @TypeGraphQL.Field(_type => EventUpdateInput, {
    nullable: false
  })
  data!: EventUpdateInput;

  @TypeGraphQL.Field(_type => EventWhereUniqueInput, {
    nullable: false
  })
  where!: EventWhereUniqueInput;
}
