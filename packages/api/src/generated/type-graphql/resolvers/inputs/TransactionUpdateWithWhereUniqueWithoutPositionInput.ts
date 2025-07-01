import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { TransactionUpdateWithoutPositionInput } from "../inputs/TransactionUpdateWithoutPositionInput";
import { TransactionWhereUniqueInput } from "../inputs/TransactionWhereUniqueInput";

@TypeGraphQL.InputType("TransactionUpdateWithWhereUniqueWithoutPositionInput", {})
export class TransactionUpdateWithWhereUniqueWithoutPositionInput {
  @TypeGraphQL.Field(_type => TransactionWhereUniqueInput, {
    nullable: false
  })
  where!: TransactionWhereUniqueInput;

  @TypeGraphQL.Field(_type => TransactionUpdateWithoutPositionInput, {
    nullable: false
  })
  data!: TransactionUpdateWithoutPositionInput;
}
