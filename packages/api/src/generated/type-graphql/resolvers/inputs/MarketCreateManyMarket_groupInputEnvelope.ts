import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { MarketCreateManyMarket_groupInput } from "../inputs/MarketCreateManyMarket_groupInput";

@TypeGraphQL.InputType("MarketCreateManyMarket_groupInputEnvelope", {})
export class MarketCreateManyMarket_groupInputEnvelope {
  @TypeGraphQL.Field(_type => [MarketCreateManyMarket_groupInput], {
    nullable: false
  })
  data!: MarketCreateManyMarket_groupInput[];

  @TypeGraphQL.Field(_type => Boolean, {
    nullable: true
  })
  skipDuplicates?: boolean | undefined;
}
