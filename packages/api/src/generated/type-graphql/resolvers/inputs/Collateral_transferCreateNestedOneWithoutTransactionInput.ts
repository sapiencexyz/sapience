import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Collateral_transferCreateOrConnectWithoutTransactionInput } from "../inputs/Collateral_transferCreateOrConnectWithoutTransactionInput";
import { Collateral_transferCreateWithoutTransactionInput } from "../inputs/Collateral_transferCreateWithoutTransactionInput";
import { Collateral_transferWhereUniqueInput } from "../inputs/Collateral_transferWhereUniqueInput";

@TypeGraphQL.InputType("Collateral_transferCreateNestedOneWithoutTransactionInput", {})
export class Collateral_transferCreateNestedOneWithoutTransactionInput {
  @TypeGraphQL.Field(_type => Collateral_transferCreateWithoutTransactionInput, {
    nullable: true
  })
  create?: Collateral_transferCreateWithoutTransactionInput | undefined;

  @TypeGraphQL.Field(_type => Collateral_transferCreateOrConnectWithoutTransactionInput, {
    nullable: true
  })
  connectOrCreate?: Collateral_transferCreateOrConnectWithoutTransactionInput | undefined;

  @TypeGraphQL.Field(_type => Collateral_transferWhereUniqueInput, {
    nullable: true
  })
  connect?: Collateral_transferWhereUniqueInput | undefined;
}
