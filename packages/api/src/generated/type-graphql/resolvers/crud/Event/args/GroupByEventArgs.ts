import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { EventOrderByWithAggregationInput } from "../../../inputs/EventOrderByWithAggregationInput";
import { EventScalarWhereWithAggregatesInput } from "../../../inputs/EventScalarWhereWithAggregatesInput";
import { EventWhereInput } from "../../../inputs/EventWhereInput";
import { EventScalarFieldEnum } from "../../../../enums/EventScalarFieldEnum";

@TypeGraphQL.ArgsType()
export class GroupByEventArgs {
  @TypeGraphQL.Field(_type => EventWhereInput, {
    nullable: true
  })
  where?: EventWhereInput | undefined;

  @TypeGraphQL.Field(_type => [EventOrderByWithAggregationInput], {
    nullable: true
  })
  orderBy?: EventOrderByWithAggregationInput[] | undefined;

  @TypeGraphQL.Field(_type => [EventScalarFieldEnum], {
    nullable: false
  })
  by!: Array<"id" | "createdAt" | "blockNumber" | "transactionHash" | "timestamp" | "logIndex" | "logData" | "marketGroupId">;

  @TypeGraphQL.Field(_type => EventScalarWhereWithAggregatesInput, {
    nullable: true
  })
  having?: EventScalarWhereWithAggregatesInput | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  take?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  skip?: number | undefined;
}
