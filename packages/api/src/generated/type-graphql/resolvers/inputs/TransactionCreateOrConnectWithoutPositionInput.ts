import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { TransactionCreateWithoutPositionInput } from "../inputs/TransactionCreateWithoutPositionInput";
import { TransactionWhereUniqueInput } from "../inputs/TransactionWhereUniqueInput";

@TypeGraphQL.InputType("TransactionCreateOrConnectWithoutPositionInput", {})
export class TransactionCreateOrConnectWithoutPositionInput {
  @TypeGraphQL.Field(_type => TransactionWhereUniqueInput, {
    nullable: false
  })
  where!: TransactionWhereUniqueInput;

  @TypeGraphQL.Field(_type => TransactionCreateWithoutPositionInput, {
    nullable: false
  })
  create!: TransactionCreateWithoutPositionInput;
}
