import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { TransactionCreateOrConnectWithoutCollateral_transferInput } from "../inputs/TransactionCreateOrConnectWithoutCollateral_transferInput";
import { TransactionCreateWithoutCollateral_transferInput } from "../inputs/TransactionCreateWithoutCollateral_transferInput";
import { TransactionWhereUniqueInput } from "../inputs/TransactionWhereUniqueInput";

@TypeGraphQL.InputType("TransactionCreateNestedOneWithoutCollateral_transferInput", {})
export class TransactionCreateNestedOneWithoutCollateral_transferInput {
  @TypeGraphQL.Field(_type => TransactionCreateWithoutCollateral_transferInput, {
    nullable: true
  })
  create?: TransactionCreateWithoutCollateral_transferInput | undefined;

  @TypeGraphQL.Field(_type => TransactionCreateOrConnectWithoutCollateral_transferInput, {
    nullable: true
  })
  connectOrCreate?: TransactionCreateOrConnectWithoutCollateral_transferInput | undefined;

  @TypeGraphQL.Field(_type => TransactionWhereUniqueInput, {
    nullable: true
  })
  connect?: TransactionWhereUniqueInput | undefined;
}
