import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Market_groupOrderByWithRelationInput } from "../../../inputs/Market_groupOrderByWithRelationInput";
import { Market_groupWhereInput } from "../../../inputs/Market_groupWhereInput";
import { Market_groupWhereUniqueInput } from "../../../inputs/Market_groupWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class AggregateMarket_groupArgs {
  @TypeGraphQL.Field(_type => Market_groupWhereInput, {
    nullable: true
  })
  where?: Market_groupWhereInput | undefined;

  @TypeGraphQL.Field(_type => [Market_groupOrderByWithRelationInput], {
    nullable: true
  })
  orderBy?: Market_groupOrderByWithRelationInput[] | undefined;

  @TypeGraphQL.Field(_type => Market_groupWhereUniqueInput, {
    nullable: true
  })
  cursor?: Market_groupWhereUniqueInput | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  take?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  skip?: number | undefined;
}
