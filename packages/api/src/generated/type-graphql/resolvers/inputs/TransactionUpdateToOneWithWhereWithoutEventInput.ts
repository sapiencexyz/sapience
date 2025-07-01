import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { TransactionUpdateWithoutEventInput } from "../inputs/TransactionUpdateWithoutEventInput";
import { TransactionWhereInput } from "../inputs/TransactionWhereInput";

@TypeGraphQL.InputType("TransactionUpdateToOneWithWhereWithoutEventInput", {})
export class TransactionUpdateToOneWithWhereWithoutEventInput {
  @TypeGraphQL.Field(_type => TransactionWhereInput, {
    nullable: true
  })
  where?: TransactionWhereInput | undefined;

  @TypeGraphQL.Field(_type => TransactionUpdateWithoutEventInput, {
    nullable: false
  })
  data!: TransactionUpdateWithoutEventInput;
}
