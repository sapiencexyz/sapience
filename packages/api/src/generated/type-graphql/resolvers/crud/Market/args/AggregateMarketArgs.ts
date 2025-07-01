import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { MarketOrderByWithRelationInput } from "../../../inputs/MarketOrderByWithRelationInput";
import { MarketWhereInput } from "../../../inputs/MarketWhereInput";
import { MarketWhereUniqueInput } from "../../../inputs/MarketWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class AggregateMarketArgs {
  @TypeGraphQL.Field(_type => MarketWhereInput, {
    nullable: true
  })
  where?: MarketWhereInput | undefined;

  @TypeGraphQL.Field(_type => [MarketOrderByWithRelationInput], {
    nullable: true
  })
  orderBy?: MarketOrderByWithRelationInput[] | undefined;

  @TypeGraphQL.Field(_type => MarketWhereUniqueInput, {
    nullable: true
  })
  cursor?: MarketWhereUniqueInput | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  take?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  skip?: number | undefined;
}
