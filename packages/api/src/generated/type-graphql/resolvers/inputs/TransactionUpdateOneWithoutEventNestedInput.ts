import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { TransactionCreateOrConnectWithoutEventInput } from "../inputs/TransactionCreateOrConnectWithoutEventInput";
import { TransactionCreateWithoutEventInput } from "../inputs/TransactionCreateWithoutEventInput";
import { TransactionUpdateToOneWithWhereWithoutEventInput } from "../inputs/TransactionUpdateToOneWithWhereWithoutEventInput";
import { TransactionUpsertWithoutEventInput } from "../inputs/TransactionUpsertWithoutEventInput";
import { TransactionWhereInput } from "../inputs/TransactionWhereInput";
import { TransactionWhereUniqueInput } from "../inputs/TransactionWhereUniqueInput";

@TypeGraphQL.InputType("TransactionUpdateOneWithoutEventNestedInput", {})
export class TransactionUpdateOneWithoutEventNestedInput {
  @TypeGraphQL.Field(_type => TransactionCreateWithoutEventInput, {
    nullable: true
  })
  create?: TransactionCreateWithoutEventInput | undefined;

  @TypeGraphQL.Field(_type => TransactionCreateOrConnectWithoutEventInput, {
    nullable: true
  })
  connectOrCreate?: TransactionCreateOrConnectWithoutEventInput | undefined;

  @TypeGraphQL.Field(_type => TransactionUpsertWithoutEventInput, {
    nullable: true
  })
  upsert?: TransactionUpsertWithoutEventInput | undefined;

  @TypeGraphQL.Field(_type => TransactionWhereInput, {
    nullable: true
  })
  disconnect?: TransactionWhereInput | undefined;

  @TypeGraphQL.Field(_type => TransactionWhereInput, {
    nullable: true
  })
  delete?: TransactionWhereInput | undefined;

  @TypeGraphQL.Field(_type => TransactionWhereUniqueInput, {
    nullable: true
  })
  connect?: TransactionWhereUniqueInput | undefined;

  @TypeGraphQL.Field(_type => TransactionUpdateToOneWithWhereWithoutEventInput, {
    nullable: true
  })
  update?: TransactionUpdateToOneWithWhereWithoutEventInput | undefined;
}
