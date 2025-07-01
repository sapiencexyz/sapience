import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { TransactionAvgAggregate } from "../outputs/TransactionAvgAggregate";
import { TransactionCountAggregate } from "../outputs/TransactionCountAggregate";
import { TransactionMaxAggregate } from "../outputs/TransactionMaxAggregate";
import { TransactionMinAggregate } from "../outputs/TransactionMinAggregate";
import { TransactionSumAggregate } from "../outputs/TransactionSumAggregate";
import { transaction_type_enum } from "../../enums/transaction_type_enum";

@TypeGraphQL.ObjectType("TransactionGroupBy", {})
export class TransactionGroupBy {
  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: false
  })
  id!: number;

  @TypeGraphQL.Field(_type => Date, {
    nullable: false
  })
  createdAt!: Date;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  tradeRatioD18!: Prisma.Decimal | null;

  @TypeGraphQL.Field(_type => transaction_type_enum, {
    nullable: false
  })
  type!: "addLiquidity" | "removeLiquidity" | "long" | "short" | "settledPosition";

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  baseToken!: Prisma.Decimal | null;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  quoteToken!: Prisma.Decimal | null;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  borrowedBaseToken!: Prisma.Decimal | null;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  borrowedQuoteToken!: Prisma.Decimal | null;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: false
  })
  collateral!: Prisma.Decimal;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  lpBaseDeltaToken!: Prisma.Decimal | null;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  lpQuoteDeltaToken!: Prisma.Decimal | null;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  eventId!: number | null;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  positionId!: number | null;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  marketPriceId!: number | null;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  collateralTransferId!: number | null;

  @TypeGraphQL.Field(_type => TransactionCountAggregate, {
    nullable: true
  })
  _count!: TransactionCountAggregate | null;

  @TypeGraphQL.Field(_type => TransactionAvgAggregate, {
    nullable: true
  })
  _avg!: TransactionAvgAggregate | null;

  @TypeGraphQL.Field(_type => TransactionSumAggregate, {
    nullable: true
  })
  _sum!: TransactionSumAggregate | null;

  @TypeGraphQL.Field(_type => TransactionMinAggregate, {
    nullable: true
  })
  _min!: TransactionMinAggregate | null;

  @TypeGraphQL.Field(_type => TransactionMaxAggregate, {
    nullable: true
  })
  _max!: TransactionMaxAggregate | null;
}
