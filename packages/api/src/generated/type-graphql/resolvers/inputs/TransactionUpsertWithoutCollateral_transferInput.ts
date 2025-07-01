import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { TransactionCreateWithoutCollateral_transferInput } from "../inputs/TransactionCreateWithoutCollateral_transferInput";
import { TransactionUpdateWithoutCollateral_transferInput } from "../inputs/TransactionUpdateWithoutCollateral_transferInput";
import { TransactionWhereInput } from "../inputs/TransactionWhereInput";

@TypeGraphQL.InputType("TransactionUpsertWithoutCollateral_transferInput", {})
export class TransactionUpsertWithoutCollateral_transferInput {
  @TypeGraphQL.Field(_type => TransactionUpdateWithoutCollateral_transferInput, {
    nullable: false
  })
  update!: TransactionUpdateWithoutCollateral_transferInput;

  @TypeGraphQL.Field(_type => TransactionCreateWithoutCollateral_transferInput, {
    nullable: false
  })
  create!: TransactionCreateWithoutCollateral_transferInput;

  @TypeGraphQL.Field(_type => TransactionWhereInput, {
    nullable: true
  })
  where?: TransactionWhereInput | undefined;
}
