import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Collateral_transferCreateWithoutTransactionInput } from "../inputs/Collateral_transferCreateWithoutTransactionInput";
import { Collateral_transferWhereUniqueInput } from "../inputs/Collateral_transferWhereUniqueInput";

@TypeGraphQL.InputType("Collateral_transferCreateOrConnectWithoutTransactionInput", {})
export class Collateral_transferCreateOrConnectWithoutTransactionInput {
  @TypeGraphQL.Field(_type => Collateral_transferWhereUniqueInput, {
    nullable: false
  })
  where!: Collateral_transferWhereUniqueInput;

  @TypeGraphQL.Field(_type => Collateral_transferCreateWithoutTransactionInput, {
    nullable: false
  })
  create!: Collateral_transferCreateWithoutTransactionInput;
}
