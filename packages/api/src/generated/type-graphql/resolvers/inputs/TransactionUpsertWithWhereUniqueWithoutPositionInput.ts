import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { TransactionCreateWithoutPositionInput } from "../inputs/TransactionCreateWithoutPositionInput";
import { TransactionUpdateWithoutPositionInput } from "../inputs/TransactionUpdateWithoutPositionInput";
import { TransactionWhereUniqueInput } from "../inputs/TransactionWhereUniqueInput";

@TypeGraphQL.InputType("TransactionUpsertWithWhereUniqueWithoutPositionInput", {})
export class TransactionUpsertWithWhereUniqueWithoutPositionInput {
  @TypeGraphQL.Field(_type => TransactionWhereUniqueInput, {
    nullable: false
  })
  where!: TransactionWhereUniqueInput;

  @TypeGraphQL.Field(_type => TransactionUpdateWithoutPositionInput, {
    nullable: false
  })
  update!: TransactionUpdateWithoutPositionInput;

  @TypeGraphQL.Field(_type => TransactionCreateWithoutPositionInput, {
    nullable: false
  })
  create!: TransactionCreateWithoutPositionInput;
}
