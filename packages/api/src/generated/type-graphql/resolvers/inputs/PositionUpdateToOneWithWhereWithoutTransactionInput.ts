import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { PositionUpdateWithoutTransactionInput } from "../inputs/PositionUpdateWithoutTransactionInput";
import { PositionWhereInput } from "../inputs/PositionWhereInput";

@TypeGraphQL.InputType("PositionUpdateToOneWithWhereWithoutTransactionInput", {})
export class PositionUpdateToOneWithWhereWithoutTransactionInput {
  @TypeGraphQL.Field(_type => PositionWhereInput, {
    nullable: true
  })
  where?: PositionWhereInput | undefined;

  @TypeGraphQL.Field(_type => PositionUpdateWithoutTransactionInput, {
    nullable: false
  })
  data!: PositionUpdateWithoutTransactionInput;
}
