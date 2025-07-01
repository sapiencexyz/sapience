import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { TransactionCreateOrConnectWithoutCollateral_transferInput } from "../inputs/TransactionCreateOrConnectWithoutCollateral_transferInput";
import { TransactionCreateWithoutCollateral_transferInput } from "../inputs/TransactionCreateWithoutCollateral_transferInput";
import { TransactionUpdateToOneWithWhereWithoutCollateral_transferInput } from "../inputs/TransactionUpdateToOneWithWhereWithoutCollateral_transferInput";
import { TransactionUpsertWithoutCollateral_transferInput } from "../inputs/TransactionUpsertWithoutCollateral_transferInput";
import { TransactionWhereInput } from "../inputs/TransactionWhereInput";
import { TransactionWhereUniqueInput } from "../inputs/TransactionWhereUniqueInput";

@TypeGraphQL.InputType("TransactionUpdateOneWithoutCollateral_transferNestedInput", {})
export class TransactionUpdateOneWithoutCollateral_transferNestedInput {
  @TypeGraphQL.Field(_type => TransactionCreateWithoutCollateral_transferInput, {
    nullable: true
  })
  create?: TransactionCreateWithoutCollateral_transferInput | undefined;

  @TypeGraphQL.Field(_type => TransactionCreateOrConnectWithoutCollateral_transferInput, {
    nullable: true
  })
  connectOrCreate?: TransactionCreateOrConnectWithoutCollateral_transferInput | undefined;

  @TypeGraphQL.Field(_type => TransactionUpsertWithoutCollateral_transferInput, {
    nullable: true
  })
  upsert?: TransactionUpsertWithoutCollateral_transferInput | undefined;

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

  @TypeGraphQL.Field(_type => TransactionUpdateToOneWithWhereWithoutCollateral_transferInput, {
    nullable: true
  })
  update?: TransactionUpdateToOneWithWhereWithoutCollateral_transferInput | undefined;
}
