import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_priceCreateWithoutTransactionInput } from "../inputs/Market_priceCreateWithoutTransactionInput";
import { Market_priceWhereUniqueInput } from "../inputs/Market_priceWhereUniqueInput";

@TypeGraphQL.InputType("Market_priceCreateOrConnectWithoutTransactionInput", {})
export class Market_priceCreateOrConnectWithoutTransactionInput {
  @TypeGraphQL.Field(_type => Market_priceWhereUniqueInput, {
    nullable: false
  })
  where!: Market_priceWhereUniqueInput;

  @TypeGraphQL.Field(_type => Market_priceCreateWithoutTransactionInput, {
    nullable: false
  })
  create!: Market_priceCreateWithoutTransactionInput;
}
