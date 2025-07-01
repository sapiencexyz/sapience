import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { TransactionOrderByWithRelationInput } from "../../../inputs/TransactionOrderByWithRelationInput";
import { TransactionWhereInput } from "../../../inputs/TransactionWhereInput";
import { TransactionWhereUniqueInput } from "../../../inputs/TransactionWhereUniqueInput";
import { TransactionScalarFieldEnum } from "../../../../enums/TransactionScalarFieldEnum";

@TypeGraphQL.ArgsType()
export class FindFirstTransactionOrThrowArgs {
  @TypeGraphQL.Field(_type => TransactionWhereInput, {
    nullable: true
  })
  where?: TransactionWhereInput | undefined;

  @TypeGraphQL.Field(_type => [TransactionOrderByWithRelationInput], {
    nullable: true
  })
  orderBy?: TransactionOrderByWithRelationInput[] | undefined;

  @TypeGraphQL.Field(_type => TransactionWhereUniqueInput, {
    nullable: true
  })
  cursor?: TransactionWhereUniqueInput | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  take?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  skip?: number | undefined;

  @TypeGraphQL.Field(_type => [TransactionScalarFieldEnum], {
    nullable: true
  })
  distinct?: Array<"id" | "createdAt" | "tradeRatioD18" | "type" | "baseToken" | "quoteToken" | "borrowedBaseToken" | "borrowedQuoteToken" | "collateral" | "lpBaseDeltaToken" | "lpQuoteDeltaToken" | "eventId" | "positionId" | "marketPriceId" | "collateralTransferId"> | undefined;
}
