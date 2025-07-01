import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { TransactionUpdateWithoutCollateral_transferInput } from "../inputs/TransactionUpdateWithoutCollateral_transferInput";
import { TransactionWhereInput } from "../inputs/TransactionWhereInput";

@TypeGraphQL.InputType("TransactionUpdateToOneWithWhereWithoutCollateral_transferInput", {})
export class TransactionUpdateToOneWithWhereWithoutCollateral_transferInput {
  @TypeGraphQL.Field(_type => TransactionWhereInput, {
    nullable: true
  })
  where?: TransactionWhereInput | undefined;

  @TypeGraphQL.Field(_type => TransactionUpdateWithoutCollateral_transferInput, {
    nullable: false
  })
  data!: TransactionUpdateWithoutCollateral_transferInput;
}
