import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Collateral_transferAvgOrderByAggregateInput } from "../inputs/Collateral_transferAvgOrderByAggregateInput";
import { Collateral_transferCountOrderByAggregateInput } from "../inputs/Collateral_transferCountOrderByAggregateInput";
import { Collateral_transferMaxOrderByAggregateInput } from "../inputs/Collateral_transferMaxOrderByAggregateInput";
import { Collateral_transferMinOrderByAggregateInput } from "../inputs/Collateral_transferMinOrderByAggregateInput";
import { Collateral_transferSumOrderByAggregateInput } from "../inputs/Collateral_transferSumOrderByAggregateInput";
import { SortOrder } from "../../enums/SortOrder";

@TypeGraphQL.InputType("Collateral_transferOrderByWithAggregationInput", {})
export class Collateral_transferOrderByWithAggregationInput {
  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  id?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  createdAt?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  transactionHash?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  timestamp?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  owner?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  collateral?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => Collateral_transferCountOrderByAggregateInput, {
    nullable: true
  })
  _count?: Collateral_transferCountOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => Collateral_transferAvgOrderByAggregateInput, {
    nullable: true
  })
  _avg?: Collateral_transferAvgOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => Collateral_transferMaxOrderByAggregateInput, {
    nullable: true
  })
  _max?: Collateral_transferMaxOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => Collateral_transferMinOrderByAggregateInput, {
    nullable: true
  })
  _min?: Collateral_transferMinOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => Collateral_transferSumOrderByAggregateInput, {
    nullable: true
  })
  _sum?: Collateral_transferSumOrderByAggregateInput | undefined;
}
