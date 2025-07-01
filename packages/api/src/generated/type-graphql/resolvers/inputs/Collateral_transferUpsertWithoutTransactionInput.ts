import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Collateral_transferCreateWithoutTransactionInput } from "../inputs/Collateral_transferCreateWithoutTransactionInput";
import { Collateral_transferUpdateWithoutTransactionInput } from "../inputs/Collateral_transferUpdateWithoutTransactionInput";
import { Collateral_transferWhereInput } from "../inputs/Collateral_transferWhereInput";

@TypeGraphQL.InputType("Collateral_transferUpsertWithoutTransactionInput", {})
export class Collateral_transferUpsertWithoutTransactionInput {
  @TypeGraphQL.Field(_type => Collateral_transferUpdateWithoutTransactionInput, {
    nullable: false
  })
  update!: Collateral_transferUpdateWithoutTransactionInput;

  @TypeGraphQL.Field(_type => Collateral_transferCreateWithoutTransactionInput, {
    nullable: false
  })
  create!: Collateral_transferCreateWithoutTransactionInput;

  @TypeGraphQL.Field(_type => Collateral_transferWhereInput, {
    nullable: true
  })
  where?: Collateral_transferWhereInput | undefined;
}
