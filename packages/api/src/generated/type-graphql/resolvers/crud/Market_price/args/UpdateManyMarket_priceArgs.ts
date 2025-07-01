import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Market_priceUpdateManyMutationInput } from "../../../inputs/Market_priceUpdateManyMutationInput";
import { Market_priceWhereInput } from "../../../inputs/Market_priceWhereInput";

@TypeGraphQL.ArgsType()
export class UpdateManyMarket_priceArgs {
  @TypeGraphQL.Field(_type => Market_priceUpdateManyMutationInput, {
    nullable: false
  })
  data!: Market_priceUpdateManyMutationInput;

  @TypeGraphQL.Field(_type => Market_priceWhereInput, {
    nullable: true
  })
  where?: Market_priceWhereInput | undefined;
}
