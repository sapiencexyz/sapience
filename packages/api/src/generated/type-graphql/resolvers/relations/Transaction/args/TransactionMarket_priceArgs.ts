import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Market_priceWhereInput } from "../../../inputs/Market_priceWhereInput";

@TypeGraphQL.ArgsType()
export class TransactionMarket_priceArgs {
  @TypeGraphQL.Field(_type => Market_priceWhereInput, {
    nullable: true
  })
  where?: Market_priceWhereInput | undefined;
}
