import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { TransactionCreateWithoutEventInput } from "../inputs/TransactionCreateWithoutEventInput";
import { TransactionUpdateWithoutEventInput } from "../inputs/TransactionUpdateWithoutEventInput";
import { TransactionWhereInput } from "../inputs/TransactionWhereInput";

@TypeGraphQL.InputType("TransactionUpsertWithoutEventInput", {})
export class TransactionUpsertWithoutEventInput {
  @TypeGraphQL.Field(_type => TransactionUpdateWithoutEventInput, {
    nullable: false
  })
  update!: TransactionUpdateWithoutEventInput;

  @TypeGraphQL.Field(_type => TransactionCreateWithoutEventInput, {
    nullable: false
  })
  create!: TransactionCreateWithoutEventInput;

  @TypeGraphQL.Field(_type => TransactionWhereInput, {
    nullable: true
  })
  where?: TransactionWhereInput | undefined;
}
