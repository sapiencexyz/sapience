import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { MarketUpdateManyMutationInput } from "../../../inputs/MarketUpdateManyMutationInput";
import { MarketWhereInput } from "../../../inputs/MarketWhereInput";

@TypeGraphQL.ArgsType()
export class UpdateManyMarketArgs {
  @TypeGraphQL.Field(_type => MarketUpdateManyMutationInput, {
    nullable: false
  })
  data!: MarketUpdateManyMutationInput;

  @TypeGraphQL.Field(_type => MarketWhereInput, {
    nullable: true
  })
  where?: MarketWhereInput | undefined;
}
