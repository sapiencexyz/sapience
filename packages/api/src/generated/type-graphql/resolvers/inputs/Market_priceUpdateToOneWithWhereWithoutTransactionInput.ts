import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_priceUpdateWithoutTransactionInput } from "../inputs/Market_priceUpdateWithoutTransactionInput";
import { Market_priceWhereInput } from "../inputs/Market_priceWhereInput";

@TypeGraphQL.InputType("Market_priceUpdateToOneWithWhereWithoutTransactionInput", {})
export class Market_priceUpdateToOneWithWhereWithoutTransactionInput {
  @TypeGraphQL.Field(_type => Market_priceWhereInput, {
    nullable: true
  })
  where?: Market_priceWhereInput | undefined;

  @TypeGraphQL.Field(_type => Market_priceUpdateWithoutTransactionInput, {
    nullable: false
  })
  data!: Market_priceUpdateWithoutTransactionInput;
}
