import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Market_priceCreateManyInput } from "../../../inputs/Market_priceCreateManyInput";

@TypeGraphQL.ArgsType()
export class CreateManyAndReturnMarket_priceArgs {
  @TypeGraphQL.Field(_type => [Market_priceCreateManyInput], {
    nullable: false
  })
  data!: Market_priceCreateManyInput[];

  @TypeGraphQL.Field(_type => Boolean, {
    nullable: true
  })
  skipDuplicates?: boolean | undefined;
}
