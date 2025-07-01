import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { MarketCreateManyInput } from "../../../inputs/MarketCreateManyInput";

@TypeGraphQL.ArgsType()
export class CreateManyMarketArgs {
  @TypeGraphQL.Field(_type => [MarketCreateManyInput], {
    nullable: false
  })
  data!: MarketCreateManyInput[];

  @TypeGraphQL.Field(_type => Boolean, {
    nullable: true
  })
  skipDuplicates?: boolean | undefined;
}
