import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Collateral_transferCreateNestedOneWithoutTransactionInput } from "../inputs/Collateral_transferCreateNestedOneWithoutTransactionInput";
import { Market_priceCreateNestedOneWithoutTransactionInput } from "../inputs/Market_priceCreateNestedOneWithoutTransactionInput";
import { PositionCreateNestedOneWithoutTransactionInput } from "../inputs/PositionCreateNestedOneWithoutTransactionInput";
import { transaction_type_enum } from "../../enums/transaction_type_enum";

@TypeGraphQL.InputType("TransactionCreateWithoutEventInput", {})
export class TransactionCreateWithoutEventInput {
  @TypeGraphQL.Field(_type => Date, {
    nullable: true
  })
  createdAt?: Date | undefined;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  tradeRatioD18?: Prisma.Decimal | undefined;

  @TypeGraphQL.Field(_type => transaction_type_enum, {
    nullable: false
  })
  type!: "addLiquidity" | "removeLiquidity" | "long" | "short" | "settledPosition";

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  baseToken?: Prisma.Decimal | undefined;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  quoteToken?: Prisma.Decimal | undefined;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  borrowedBaseToken?: Prisma.Decimal | undefined;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  borrowedQuoteToken?: Prisma.Decimal | undefined;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: false
  })
  collateral!: Prisma.Decimal;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  lpBaseDeltaToken?: Prisma.Decimal | undefined;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  lpQuoteDeltaToken?: Prisma.Decimal | undefined;

  @TypeGraphQL.Field(_type => Collateral_transferCreateNestedOneWithoutTransactionInput, {
    nullable: true
  })
  collateral_transfer?: Collateral_transferCreateNestedOneWithoutTransactionInput | undefined;

  @TypeGraphQL.Field(_type => Market_priceCreateNestedOneWithoutTransactionInput, {
    nullable: true
  })
  market_price?: Market_priceCreateNestedOneWithoutTransactionInput | undefined;

  @TypeGraphQL.Field(_type => PositionCreateNestedOneWithoutTransactionInput, {
    nullable: true
  })
  position?: PositionCreateNestedOneWithoutTransactionInput | undefined;
}
