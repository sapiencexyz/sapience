import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { PositionCreateWithoutTransactionInput } from "../inputs/PositionCreateWithoutTransactionInput";
import { PositionUpdateWithoutTransactionInput } from "../inputs/PositionUpdateWithoutTransactionInput";
import { PositionWhereInput } from "../inputs/PositionWhereInput";

@TypeGraphQL.InputType("PositionUpsertWithoutTransactionInput", {})
export class PositionUpsertWithoutTransactionInput {
  @TypeGraphQL.Field(_type => PositionUpdateWithoutTransactionInput, {
    nullable: false
  })
  update!: PositionUpdateWithoutTransactionInput;

  @TypeGraphQL.Field(_type => PositionCreateWithoutTransactionInput, {
    nullable: false
  })
  create!: PositionCreateWithoutTransactionInput;

  @TypeGraphQL.Field(_type => PositionWhereInput, {
    nullable: true
  })
  where?: PositionWhereInput | undefined;
}
