import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { EventCreateInput } from "../../../inputs/EventCreateInput";
import { EventUpdateInput } from "../../../inputs/EventUpdateInput";
import { EventWhereUniqueInput } from "../../../inputs/EventWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class UpsertOneEventArgs {
  @TypeGraphQL.Field(_type => EventWhereUniqueInput, {
    nullable: false
  })
  where!: EventWhereUniqueInput;

  @TypeGraphQL.Field(_type => EventCreateInput, {
    nullable: false
  })
  create!: EventCreateInput;

  @TypeGraphQL.Field(_type => EventUpdateInput, {
    nullable: false
  })
  update!: EventUpdateInput;
}
