import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Collateral_transferOrderByWithAggregationInput } from "../../../inputs/Collateral_transferOrderByWithAggregationInput";
import { Collateral_transferScalarWhereWithAggregatesInput } from "../../../inputs/Collateral_transferScalarWhereWithAggregatesInput";
import { Collateral_transferWhereInput } from "../../../inputs/Collateral_transferWhereInput";
import { Collateral_transferScalarFieldEnum } from "../../../../enums/Collateral_transferScalarFieldEnum";

@TypeGraphQL.ArgsType()
export class GroupByCollateral_transferArgs {
  @TypeGraphQL.Field(_type => Collateral_transferWhereInput, {
    nullable: true
  })
  where?: Collateral_transferWhereInput | undefined;

  @TypeGraphQL.Field(_type => [Collateral_transferOrderByWithAggregationInput], {
    nullable: true
  })
  orderBy?: Collateral_transferOrderByWithAggregationInput[] | undefined;

  @TypeGraphQL.Field(_type => [Collateral_transferScalarFieldEnum], {
    nullable: false
  })
  by!: Array<"id" | "createdAt" | "transactionHash" | "timestamp" | "owner" | "collateral">;

  @TypeGraphQL.Field(_type => Collateral_transferScalarWhereWithAggregatesInput, {
    nullable: true
  })
  having?: Collateral_transferScalarWhereWithAggregatesInput | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  take?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  skip?: number | undefined;
}
