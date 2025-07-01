import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Collateral_transferUpdateWithoutTransactionInput } from "../inputs/Collateral_transferUpdateWithoutTransactionInput";
import { Collateral_transferWhereInput } from "../inputs/Collateral_transferWhereInput";

@TypeGraphQL.InputType("Collateral_transferUpdateToOneWithWhereWithoutTransactionInput", {})
export class Collateral_transferUpdateToOneWithWhereWithoutTransactionInput {
  @TypeGraphQL.Field(_type => Collateral_transferWhereInput, {
    nullable: true
  })
  where?: Collateral_transferWhereInput | undefined;

  @TypeGraphQL.Field(_type => Collateral_transferUpdateWithoutTransactionInput, {
    nullable: false
  })
  data!: Collateral_transferUpdateWithoutTransactionInput;
}
