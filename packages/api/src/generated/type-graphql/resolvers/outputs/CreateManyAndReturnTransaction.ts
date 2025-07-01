import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { CreateManyAndReturnTransactionCollateral_transferArgs } from "./args/CreateManyAndReturnTransactionCollateral_transferArgs";
import { CreateManyAndReturnTransactionEventArgs } from "./args/CreateManyAndReturnTransactionEventArgs";
import { CreateManyAndReturnTransactionMarket_priceArgs } from "./args/CreateManyAndReturnTransactionMarket_priceArgs";
import { CreateManyAndReturnTransactionPositionArgs } from "./args/CreateManyAndReturnTransactionPositionArgs";
import { Collateral_transfer } from "../../models/Collateral_transfer";
import { Event } from "../../models/Event";
import { Market_price } from "../../models/Market_price";
import { Position } from "../../models/Position";
import { transaction_type_enum } from "../../enums/transaction_type_enum";

@TypeGraphQL.ObjectType("CreateManyAndReturnTransaction", {})
export class CreateManyAndReturnTransaction {
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

  collateral_transfer!: Collateral_transfer | null;
  market_price!: Market_price | null;
  event!: Event | null;
  position!: Position | null;

  @TypeGraphQL.Field(_type => Collateral_transfer, {
    name: "collateral_transfer",
    nullable: true
  })
  getCollateral_transfer(@TypeGraphQL.Root() root: CreateManyAndReturnTransaction, @TypeGraphQL.Args() args: CreateManyAndReturnTransactionCollateral_transferArgs): Collateral_transfer | null {
    return root.collateral_transfer;
  }

  @TypeGraphQL.Field(_type => Market_price, {
    name: "market_price",
    nullable: true
  })
  getMarket_price(@TypeGraphQL.Root() root: CreateManyAndReturnTransaction, @TypeGraphQL.Args() args: CreateManyAndReturnTransactionMarket_priceArgs): Market_price | null {
    return root.market_price;
  }

  @TypeGraphQL.Field(_type => Event, {
    name: "event",
    nullable: true
  })
  getEvent(@TypeGraphQL.Root() root: CreateManyAndReturnTransaction, @TypeGraphQL.Args() args: CreateManyAndReturnTransactionEventArgs): Event | null {
    return root.event;
  }

  @TypeGraphQL.Field(_type => Position, {
    name: "position",
    nullable: true
  })
  getPosition(@TypeGraphQL.Root() root: CreateManyAndReturnTransaction, @TypeGraphQL.Args() args: CreateManyAndReturnTransactionPositionArgs): Position | null {
    return root.position;
  }
}
