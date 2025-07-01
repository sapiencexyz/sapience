import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { TransactionCreateManyPositionInputEnvelope } from "../inputs/TransactionCreateManyPositionInputEnvelope";
import { TransactionCreateOrConnectWithoutPositionInput } from "../inputs/TransactionCreateOrConnectWithoutPositionInput";
import { TransactionCreateWithoutPositionInput } from "../inputs/TransactionCreateWithoutPositionInput";
import { TransactionWhereUniqueInput } from "../inputs/TransactionWhereUniqueInput";

@TypeGraphQL.InputType("TransactionCreateNestedManyWithoutPositionInput", {})
export class TransactionCreateNestedManyWithoutPositionInput {
  @TypeGraphQL.Field(_type => [TransactionCreateWithoutPositionInput], {
    nullable: true
  })
  create?: TransactionCreateWithoutPositionInput[] | undefined;

  @TypeGraphQL.Field(_type => [TransactionCreateOrConnectWithoutPositionInput], {
    nullable: true
  })
  connectOrCreate?: TransactionCreateOrConnectWithoutPositionInput[] | undefined;

  @TypeGraphQL.Field(_type => TransactionCreateManyPositionInputEnvelope, {
    nullable: true
  })
  createMany?: TransactionCreateManyPositionInputEnvelope | undefined;

  @TypeGraphQL.Field(_type => [TransactionWhereUniqueInput], {
    nullable: true
  })
  connect?: TransactionWhereUniqueInput[] | undefined;
}
