import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { PositionCreateOrConnectWithoutTransactionInput } from "../inputs/PositionCreateOrConnectWithoutTransactionInput";
import { PositionCreateWithoutTransactionInput } from "../inputs/PositionCreateWithoutTransactionInput";
import { PositionUpdateToOneWithWhereWithoutTransactionInput } from "../inputs/PositionUpdateToOneWithWhereWithoutTransactionInput";
import { PositionUpsertWithoutTransactionInput } from "../inputs/PositionUpsertWithoutTransactionInput";
import { PositionWhereInput } from "../inputs/PositionWhereInput";
import { PositionWhereUniqueInput } from "../inputs/PositionWhereUniqueInput";

@TypeGraphQL.InputType("PositionUpdateOneWithoutTransactionNestedInput", {})
export class PositionUpdateOneWithoutTransactionNestedInput {
  @TypeGraphQL.Field(_type => PositionCreateWithoutTransactionInput, {
    nullable: true
  })
  create?: PositionCreateWithoutTransactionInput | undefined;

  @TypeGraphQL.Field(_type => PositionCreateOrConnectWithoutTransactionInput, {
    nullable: true
  })
  connectOrCreate?: PositionCreateOrConnectWithoutTransactionInput | undefined;

  @TypeGraphQL.Field(_type => PositionUpsertWithoutTransactionInput, {
    nullable: true
  })
  upsert?: PositionUpsertWithoutTransactionInput | undefined;

  @TypeGraphQL.Field(_type => PositionWhereInput, {
    nullable: true
  })
  disconnect?: PositionWhereInput | undefined;

  @TypeGraphQL.Field(_type => PositionWhereInput, {
    nullable: true
  })
  delete?: PositionWhereInput | undefined;

  @TypeGraphQL.Field(_type => PositionWhereUniqueInput, {
    nullable: true
  })
  connect?: PositionWhereUniqueInput | undefined;

  @TypeGraphQL.Field(_type => PositionUpdateToOneWithWhereWithoutTransactionInput, {
    nullable: true
  })
  update?: PositionUpdateToOneWithWhereWithoutTransactionInput | undefined;
}
