import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_priceCreateWithoutTransactionInput } from "../inputs/Market_priceCreateWithoutTransactionInput";
import { Market_priceUpdateWithoutTransactionInput } from "../inputs/Market_priceUpdateWithoutTransactionInput";
import { Market_priceWhereInput } from "../inputs/Market_priceWhereInput";

@TypeGraphQL.InputType("Market_priceUpsertWithoutTransactionInput", {})
export class Market_priceUpsertWithoutTransactionInput {
  @TypeGraphQL.Field(_type => Market_priceUpdateWithoutTransactionInput, {
    nullable: false
  })
  update!: Market_priceUpdateWithoutTransactionInput;

  @TypeGraphQL.Field(_type => Market_priceCreateWithoutTransactionInput, {
    nullable: false
  })
  create!: Market_priceCreateWithoutTransactionInput;

  @TypeGraphQL.Field(_type => Market_priceWhereInput, {
    nullable: true
  })
  where?: Market_priceWhereInput | undefined;
}
