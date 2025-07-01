import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_groupOrderByWithRelationInput } from "../inputs/Market_groupOrderByWithRelationInput";
import { SortOrderInput } from "../inputs/SortOrderInput";
import { TransactionOrderByWithRelationInput } from "../inputs/TransactionOrderByWithRelationInput";
import { SortOrder } from "../../enums/SortOrder";

@TypeGraphQL.InputType("EventOrderByWithRelationInput", {})
export class EventOrderByWithRelationInput {
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
  blockNumber?: "asc" | "desc" | undefined;

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
  logIndex?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  logData?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  marketGroupId?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => Market_groupOrderByWithRelationInput, {
    nullable: true
  })
  market_group?: Market_groupOrderByWithRelationInput | undefined;

  @TypeGraphQL.Field(_type => TransactionOrderByWithRelationInput, {
    nullable: true
  })
  transaction?: TransactionOrderByWithRelationInput | undefined;
}
