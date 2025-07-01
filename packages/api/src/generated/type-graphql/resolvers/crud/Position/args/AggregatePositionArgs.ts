import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { PositionOrderByWithRelationInput } from "../../../inputs/PositionOrderByWithRelationInput";
import { PositionWhereInput } from "../../../inputs/PositionWhereInput";
import { PositionWhereUniqueInput } from "../../../inputs/PositionWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class AggregatePositionArgs {
  @TypeGraphQL.Field(_type => PositionWhereInput, {
    nullable: true
  })
  where?: PositionWhereInput | undefined;

  @TypeGraphQL.Field(_type => [PositionOrderByWithRelationInput], {
    nullable: true
  })
  orderBy?: PositionOrderByWithRelationInput[] | undefined;

  @TypeGraphQL.Field(_type => PositionWhereUniqueInput, {
    nullable: true
  })
  cursor?: PositionWhereUniqueInput | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  take?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  skip?: number | undefined;
}
