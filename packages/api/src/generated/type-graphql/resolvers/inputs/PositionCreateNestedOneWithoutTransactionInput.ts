import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { PositionCreateOrConnectWithoutTransactionInput } from "../inputs/PositionCreateOrConnectWithoutTransactionInput";
import { PositionCreateWithoutTransactionInput } from "../inputs/PositionCreateWithoutTransactionInput";
import { PositionWhereUniqueInput } from "../inputs/PositionWhereUniqueInput";

@TypeGraphQL.InputType("PositionCreateNestedOneWithoutTransactionInput", {})
export class PositionCreateNestedOneWithoutTransactionInput {
  @TypeGraphQL.Field(_type => PositionCreateWithoutTransactionInput, {
    nullable: true
  })
  create?: PositionCreateWithoutTransactionInput | undefined;

  @TypeGraphQL.Field(_type => PositionCreateOrConnectWithoutTransactionInput, {
    nullable: true
  })
  connectOrCreate?: PositionCreateOrConnectWithoutTransactionInput | undefined;

  @TypeGraphQL.Field(_type => PositionWhereUniqueInput, {
    nullable: true
  })
  connect?: PositionWhereUniqueInput | undefined;
}
