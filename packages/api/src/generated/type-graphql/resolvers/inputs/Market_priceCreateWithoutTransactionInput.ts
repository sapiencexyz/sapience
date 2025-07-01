import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";

@TypeGraphQL.InputType("Market_priceCreateWithoutTransactionInput", {})
export class Market_priceCreateWithoutTransactionInput {
  @TypeGraphQL.Field(_type => Date, {
    nullable: true
  })
  createdAt?: Date | undefined;

  @TypeGraphQL.Field(_type => GraphQLScalars.BigIntResolver, {
    nullable: false
  })
  timestamp!: bigint;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: false
  })
  value!: Prisma.Decimal;
}
