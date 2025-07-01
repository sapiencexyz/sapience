import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { NestedEnumtransaction_type_enumFilter } from "../inputs/NestedEnumtransaction_type_enumFilter";
import { NestedEnumtransaction_type_enumWithAggregatesFilter } from "../inputs/NestedEnumtransaction_type_enumWithAggregatesFilter";
import { NestedIntFilter } from "../inputs/NestedIntFilter";
import { transaction_type_enum } from "../../enums/transaction_type_enum";

@TypeGraphQL.InputType("Enumtransaction_type_enumWithAggregatesFilter", {})
export class Enumtransaction_type_enumWithAggregatesFilter {
  @TypeGraphQL.Field(_type => transaction_type_enum, {
    nullable: true
  })
  equals?: "addLiquidity" | "removeLiquidity" | "long" | "short" | "settledPosition" | undefined;

  @TypeGraphQL.Field(_type => [transaction_type_enum], {
    nullable: true
  })
  in?: Array<"addLiquidity" | "removeLiquidity" | "long" | "short" | "settledPosition"> | undefined;

  @TypeGraphQL.Field(_type => [transaction_type_enum], {
    nullable: true
  })
  notIn?: Array<"addLiquidity" | "removeLiquidity" | "long" | "short" | "settledPosition"> | undefined;

  @TypeGraphQL.Field(_type => NestedEnumtransaction_type_enumWithAggregatesFilter, {
    nullable: true
  })
  not?: NestedEnumtransaction_type_enumWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => NestedIntFilter, {
    nullable: true
  })
  _count?: NestedIntFilter | undefined;

  @TypeGraphQL.Field(_type => NestedEnumtransaction_type_enumFilter, {
    nullable: true
  })
  _min?: NestedEnumtransaction_type_enumFilter | undefined;

  @TypeGraphQL.Field(_type => NestedEnumtransaction_type_enumFilter, {
    nullable: true
  })
  _max?: NestedEnumtransaction_type_enumFilter | undefined;
}
