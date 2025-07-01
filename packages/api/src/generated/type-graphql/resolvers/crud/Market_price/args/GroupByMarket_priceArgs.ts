import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Market_priceOrderByWithAggregationInput } from "../../../inputs/Market_priceOrderByWithAggregationInput";
import { Market_priceScalarWhereWithAggregatesInput } from "../../../inputs/Market_priceScalarWhereWithAggregatesInput";
import { Market_priceWhereInput } from "../../../inputs/Market_priceWhereInput";
import { Market_priceScalarFieldEnum } from "../../../../enums/Market_priceScalarFieldEnum";

@TypeGraphQL.ArgsType()
export class GroupByMarket_priceArgs {
  @TypeGraphQL.Field(_type => Market_priceWhereInput, {
    nullable: true
  })
  where?: Market_priceWhereInput | undefined;

  @TypeGraphQL.Field(_type => [Market_priceOrderByWithAggregationInput], {
    nullable: true
  })
  orderBy?: Market_priceOrderByWithAggregationInput[] | undefined;

  @TypeGraphQL.Field(_type => [Market_priceScalarFieldEnum], {
    nullable: false
  })
  by!: Array<"id" | "createdAt" | "timestamp" | "value">;

  @TypeGraphQL.Field(_type => Market_priceScalarWhereWithAggregatesInput, {
    nullable: true
  })
  having?: Market_priceScalarWhereWithAggregatesInput | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  take?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  skip?: number | undefined;
}
