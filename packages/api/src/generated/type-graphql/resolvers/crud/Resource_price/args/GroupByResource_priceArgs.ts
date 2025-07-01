import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Resource_priceOrderByWithAggregationInput } from "../../../inputs/Resource_priceOrderByWithAggregationInput";
import { Resource_priceScalarWhereWithAggregatesInput } from "../../../inputs/Resource_priceScalarWhereWithAggregatesInput";
import { Resource_priceWhereInput } from "../../../inputs/Resource_priceWhereInput";
import { Resource_priceScalarFieldEnum } from "../../../../enums/Resource_priceScalarFieldEnum";

@TypeGraphQL.ArgsType()
export class GroupByResource_priceArgs {
  @TypeGraphQL.Field(_type => Resource_priceWhereInput, {
    nullable: true
  })
  where?: Resource_priceWhereInput | undefined;

  @TypeGraphQL.Field(_type => [Resource_priceOrderByWithAggregationInput], {
    nullable: true
  })
  orderBy?: Resource_priceOrderByWithAggregationInput[] | undefined;

  @TypeGraphQL.Field(_type => [Resource_priceScalarFieldEnum], {
    nullable: false
  })
  by!: Array<"id" | "createdAt" | "blockNumber" | "timestamp" | "value" | "used" | "feePaid" | "resourceId">;

  @TypeGraphQL.Field(_type => Resource_priceScalarWhereWithAggregatesInput, {
    nullable: true
  })
  having?: Resource_priceScalarWhereWithAggregatesInput | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  take?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  skip?: number | undefined;
}
