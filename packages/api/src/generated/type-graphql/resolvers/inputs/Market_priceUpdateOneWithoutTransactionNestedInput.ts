import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_priceCreateOrConnectWithoutTransactionInput } from "../inputs/Market_priceCreateOrConnectWithoutTransactionInput";
import { Market_priceCreateWithoutTransactionInput } from "../inputs/Market_priceCreateWithoutTransactionInput";
import { Market_priceUpdateToOneWithWhereWithoutTransactionInput } from "../inputs/Market_priceUpdateToOneWithWhereWithoutTransactionInput";
import { Market_priceUpsertWithoutTransactionInput } from "../inputs/Market_priceUpsertWithoutTransactionInput";
import { Market_priceWhereInput } from "../inputs/Market_priceWhereInput";
import { Market_priceWhereUniqueInput } from "../inputs/Market_priceWhereUniqueInput";

@TypeGraphQL.InputType("Market_priceUpdateOneWithoutTransactionNestedInput", {})
export class Market_priceUpdateOneWithoutTransactionNestedInput {
  @TypeGraphQL.Field(_type => Market_priceCreateWithoutTransactionInput, {
    nullable: true
  })
  create?: Market_priceCreateWithoutTransactionInput | undefined;

  @TypeGraphQL.Field(_type => Market_priceCreateOrConnectWithoutTransactionInput, {
    nullable: true
  })
  connectOrCreate?: Market_priceCreateOrConnectWithoutTransactionInput | undefined;

  @TypeGraphQL.Field(_type => Market_priceUpsertWithoutTransactionInput, {
    nullable: true
  })
  upsert?: Market_priceUpsertWithoutTransactionInput | undefined;

  @TypeGraphQL.Field(_type => Market_priceWhereInput, {
    nullable: true
  })
  disconnect?: Market_priceWhereInput | undefined;

  @TypeGraphQL.Field(_type => Market_priceWhereInput, {
    nullable: true
  })
  delete?: Market_priceWhereInput | undefined;

  @TypeGraphQL.Field(_type => Market_priceWhereUniqueInput, {
    nullable: true
  })
  connect?: Market_priceWhereUniqueInput | undefined;

  @TypeGraphQL.Field(_type => Market_priceUpdateToOneWithWhereWithoutTransactionInput, {
    nullable: true
  })
  update?: Market_priceUpdateToOneWithWhereWithoutTransactionInput | undefined;
}
