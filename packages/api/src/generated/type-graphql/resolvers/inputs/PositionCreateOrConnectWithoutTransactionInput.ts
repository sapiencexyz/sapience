import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { PositionCreateWithoutTransactionInput } from "../inputs/PositionCreateWithoutTransactionInput";
import { PositionWhereUniqueInput } from "../inputs/PositionWhereUniqueInput";

@TypeGraphQL.InputType("PositionCreateOrConnectWithoutTransactionInput", {})
export class PositionCreateOrConnectWithoutTransactionInput {
  @TypeGraphQL.Field(_type => PositionWhereUniqueInput, {
    nullable: false
  })
  where!: PositionWhereUniqueInput;

  @TypeGraphQL.Field(_type => PositionCreateWithoutTransactionInput, {
    nullable: false
  })
  create!: PositionCreateWithoutTransactionInput;
}
