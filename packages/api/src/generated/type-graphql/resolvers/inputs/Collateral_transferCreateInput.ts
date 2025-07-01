import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { TransactionCreateNestedOneWithoutCollateral_transferInput } from "../inputs/TransactionCreateNestedOneWithoutCollateral_transferInput";

@TypeGraphQL.InputType("Collateral_transferCreateInput", {})
export class Collateral_transferCreateInput {
  @TypeGraphQL.Field(_type => Date, {
    nullable: true
  })
  createdAt?: Date | undefined;

  @TypeGraphQL.Field(_type => String, {
    nullable: false
  })
  transactionHash!: string;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: false
  })
  timestamp!: number;

  @TypeGraphQL.Field(_type => String, {
    nullable: false
  })
  owner!: string;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: false
  })
  collateral!: Prisma.Decimal;

  @TypeGraphQL.Field(_type => TransactionCreateNestedOneWithoutCollateral_transferInput, {
    nullable: true
  })
  transaction?: TransactionCreateNestedOneWithoutCollateral_transferInput | undefined;
}
