import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_priceCreateOrConnectWithoutTransactionInput } from "../inputs/Market_priceCreateOrConnectWithoutTransactionInput";
import { Market_priceCreateWithoutTransactionInput } from "../inputs/Market_priceCreateWithoutTransactionInput";
import { Market_priceWhereUniqueInput } from "../inputs/Market_priceWhereUniqueInput";

@TypeGraphQL.InputType("Market_priceCreateNestedOneWithoutTransactionInput", {})
export class Market_priceCreateNestedOneWithoutTransactionInput {
  @TypeGraphQL.Field(_type => Market_priceCreateWithoutTransactionInput, {
    nullable: true
  })
  create?: Market_priceCreateWithoutTransactionInput | undefined;

  @TypeGraphQL.Field(_type => Market_priceCreateOrConnectWithoutTransactionInput, {
    nullable: true
  })
  connectOrCreate?: Market_priceCreateOrConnectWithoutTransactionInput | undefined;

  @TypeGraphQL.Field(_type => Market_priceWhereUniqueInput, {
    nullable: true
  })
  connect?: Market_priceWhereUniqueInput | undefined;
}
