import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { NestedEnumtransaction_type_enumFilter } from "../inputs/NestedEnumtransaction_type_enumFilter";
import { transaction_type_enum } from "../../enums/transaction_type_enum";

@TypeGraphQL.InputType("Enumtransaction_type_enumFilter", {})
export class Enumtransaction_type_enumFilter {
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

  @TypeGraphQL.Field(_type => NestedEnumtransaction_type_enumFilter, {
    nullable: true
  })
  not?: NestedEnumtransaction_type_enumFilter | undefined;
}
