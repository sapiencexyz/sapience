import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { EventUpdateManyMutationInput } from "../../../inputs/EventUpdateManyMutationInput";
import { EventWhereInput } from "../../../inputs/EventWhereInput";

@TypeGraphQL.ArgsType()
export class UpdateManyEventArgs {
  @TypeGraphQL.Field(_type => EventUpdateManyMutationInput, {
    nullable: false
  })
  data!: EventUpdateManyMutationInput;

  @TypeGraphQL.Field(_type => EventWhereInput, {
    nullable: true
  })
  where?: EventWhereInput | undefined;
}
