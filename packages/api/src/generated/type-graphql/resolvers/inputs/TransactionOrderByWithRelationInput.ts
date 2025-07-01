import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Collateral_transferOrderByWithRelationInput } from "../inputs/Collateral_transferOrderByWithRelationInput";
import { EventOrderByWithRelationInput } from "../inputs/EventOrderByWithRelationInput";
import { Market_priceOrderByWithRelationInput } from "../inputs/Market_priceOrderByWithRelationInput";
import { PositionOrderByWithRelationInput } from "../inputs/PositionOrderByWithRelationInput";
import { SortOrderInput } from "../inputs/SortOrderInput";
import { SortOrder } from "../../enums/SortOrder";

@TypeGraphQL.InputType("TransactionOrderByWithRelationInput", {})
export class TransactionOrderByWithRelationInput {
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

  @TypeGraphQL.Field(_type => Collateral_transferOrderByWithRelationInput, {
    nullable: true
  })
  collateral_transfer?: Collateral_transferOrderByWithRelationInput | undefined;

  @TypeGraphQL.Field(_type => Market_priceOrderByWithRelationInput, {
    nullable: true
  })
  market_price?: Market_priceOrderByWithRelationInput | undefined;

  @TypeGraphQL.Field(_type => EventOrderByWithRelationInput, {
    nullable: true
  })
  event?: EventOrderByWithRelationInput | undefined;

  @TypeGraphQL.Field(_type => PositionOrderByWithRelationInput, {
    nullable: true
  })
  position?: PositionOrderByWithRelationInput | undefined;
}
