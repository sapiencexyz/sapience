import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { TransactionWhereInput } from "../inputs/TransactionWhereInput";

@TypeGraphQL.InputType("TransactionNullableRelationFilter", {})
export class TransactionNullableRelationFilter {
  @TypeGraphQL.Field(_type => TransactionWhereInput, {
    nullable: true
  })
  is?: TransactionWhereInput | undefined;

  @TypeGraphQL.Field(_type => TransactionWhereInput, {
    nullable: true
  })
  isNot?: TransactionWhereInput | undefined;
}
