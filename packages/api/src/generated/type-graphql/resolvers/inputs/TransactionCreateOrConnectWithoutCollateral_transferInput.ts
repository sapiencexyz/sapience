import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { TransactionCreateWithoutCollateral_transferInput } from "../inputs/TransactionCreateWithoutCollateral_transferInput";
import { TransactionWhereUniqueInput } from "../inputs/TransactionWhereUniqueInput";

@TypeGraphQL.InputType("TransactionCreateOrConnectWithoutCollateral_transferInput", {})
export class TransactionCreateOrConnectWithoutCollateral_transferInput {
  @TypeGraphQL.Field(_type => TransactionWhereUniqueInput, {
    nullable: false
  })
  where!: TransactionWhereUniqueInput;

  @TypeGraphQL.Field(_type => TransactionCreateWithoutCollateral_transferInput, {
    nullable: false
  })
  create!: TransactionCreateWithoutCollateral_transferInput;
}
