import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { TransactionCreateOrConnectWithoutEventInput } from "../inputs/TransactionCreateOrConnectWithoutEventInput";
import { TransactionCreateWithoutEventInput } from "../inputs/TransactionCreateWithoutEventInput";
import { TransactionWhereUniqueInput } from "../inputs/TransactionWhereUniqueInput";

@TypeGraphQL.InputType("TransactionCreateNestedOneWithoutEventInput", {})
export class TransactionCreateNestedOneWithoutEventInput {
  @TypeGraphQL.Field(_type => TransactionCreateWithoutEventInput, {
    nullable: true
  })
  create?: TransactionCreateWithoutEventInput | undefined;

  @TypeGraphQL.Field(_type => TransactionCreateOrConnectWithoutEventInput, {
    nullable: true
  })
  connectOrCreate?: TransactionCreateOrConnectWithoutEventInput | undefined;

  @TypeGraphQL.Field(_type => TransactionWhereUniqueInput, {
    nullable: true
  })
  connect?: TransactionWhereUniqueInput | undefined;
}
