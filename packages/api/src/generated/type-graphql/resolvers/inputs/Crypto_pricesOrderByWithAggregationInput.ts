import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Crypto_pricesAvgOrderByAggregateInput } from "../inputs/Crypto_pricesAvgOrderByAggregateInput";
import { Crypto_pricesCountOrderByAggregateInput } from "../inputs/Crypto_pricesCountOrderByAggregateInput";
import { Crypto_pricesMaxOrderByAggregateInput } from "../inputs/Crypto_pricesMaxOrderByAggregateInput";
import { Crypto_pricesMinOrderByAggregateInput } from "../inputs/Crypto_pricesMinOrderByAggregateInput";
import { Crypto_pricesSumOrderByAggregateInput } from "../inputs/Crypto_pricesSumOrderByAggregateInput";
import { SortOrderInput } from "../inputs/SortOrderInput";
import { SortOrder } from "../../enums/SortOrder";

@TypeGraphQL.InputType("Crypto_pricesOrderByWithAggregationInput", {})
export class Crypto_pricesOrderByWithAggregationInput {
  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  id?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  ticker?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  price?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  timestamp?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => Crypto_pricesCountOrderByAggregateInput, {
    nullable: true
  })
  _count?: Crypto_pricesCountOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => Crypto_pricesAvgOrderByAggregateInput, {
    nullable: true
  })
  _avg?: Crypto_pricesAvgOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => Crypto_pricesMaxOrderByAggregateInput, {
    nullable: true
  })
  _max?: Crypto_pricesMaxOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => Crypto_pricesMinOrderByAggregateInput, {
    nullable: true
  })
  _min?: Crypto_pricesMinOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => Crypto_pricesSumOrderByAggregateInput, {
    nullable: true
  })
  _sum?: Crypto_pricesSumOrderByAggregateInput | undefined;
}
