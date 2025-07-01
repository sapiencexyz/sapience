import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { EventOrderByWithRelationInput } from "../../../inputs/EventOrderByWithRelationInput";
import { EventWhereInput } from "../../../inputs/EventWhereInput";
import { EventWhereUniqueInput } from "../../../inputs/EventWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class AggregateEventArgs {
  @TypeGraphQL.Field(_type => EventWhereInput, {
    nullable: true
  })
  where?: EventWhereInput | undefined;

  @TypeGraphQL.Field(_type => [EventOrderByWithRelationInput], {
    nullable: true
  })
  orderBy?: EventOrderByWithRelationInput[] | undefined;

  @TypeGraphQL.Field(_type => EventWhereUniqueInput, {
    nullable: true
  })
  cursor?: EventWhereUniqueInput | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  take?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  skip?: number | undefined;
}
