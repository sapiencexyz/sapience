import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { SortOrderInput } from "../inputs/SortOrderInput";
import { TransactionAvgOrderByAggregateInput } from "../inputs/TransactionAvgOrderByAggregateInput";
import { TransactionCountOrderByAggregateInput } from "../inputs/TransactionCountOrderByAggregateInput";
import { TransactionMaxOrderByAggregateInput } from "../inputs/TransactionMaxOrderByAggregateInput";
import { TransactionMinOrderByAggregateInput } from "../inputs/TransactionMinOrderByAggregateInput";
import { TransactionSumOrderByAggregateInput } from "../inputs/TransactionSumOrderByAggregateInput";
import { SortOrder } from "../../enums/SortOrder";

@TypeGraphQL.InputType("TransactionOrderByWithAggregationInput", {})
export class TransactionOrderByWithAggregationInput {
  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  id?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  createdAt?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  tradeRatioD18?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  type?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  baseToken?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  quoteToken?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  borrowedBaseToken?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  borrowedQuoteToken?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  collateral?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  lpBaseDeltaToken?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  lpQuoteDeltaToken?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  eventId?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  positionId?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  marketPriceId?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  collateralTransferId?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => TransactionCountOrderByAggregateInput, {
    nullable: true
  })
  _count?: TransactionCountOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => TransactionAvgOrderByAggregateInput, {
    nullable: true
  })
  _avg?: TransactionAvgOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => TransactionMaxOrderByAggregateInput, {
    nullable: true
  })
  _max?: TransactionMaxOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => TransactionMinOrderByAggregateInput, {
    nullable: true
  })
  _min?: TransactionMinOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => TransactionSumOrderByAggregateInput, {
    nullable: true
  })
  _sum?: TransactionSumOrderByAggregateInput | undefined;
}
