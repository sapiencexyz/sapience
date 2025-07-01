import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { TransactionWhereInput } from "../inputs/TransactionWhereInput";

@TypeGraphQL.InputType("TransactionListRelationFilter", {})
export class TransactionListRelationFilter {
  @TypeGraphQL.Field(_type => TransactionWhereInput, {
    nullable: true
  })
  every?: TransactionWhereInput | undefined;

  @TypeGraphQL.Field(_type => TransactionWhereInput, {
    nullable: true
  })
  some?: TransactionWhereInput | undefined;

  @TypeGraphQL.Field(_type => TransactionWhereInput, {
    nullable: true
  })
  none?: TransactionWhereInput | undefined;
}
