import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_groupCountEventArgs } from "./args/Market_groupCountEventArgs";
import { Market_groupCountMarketArgs } from "./args/Market_groupCountMarketArgs";

@TypeGraphQL.ObjectType("Market_groupCount", {})
export class Market_groupCount {
  event!: number;
  market!: number;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    name: "event",
    nullable: false
  })
  getEvent(@TypeGraphQL.Root() root: Market_groupCount, @TypeGraphQL.Args() args: Market_groupCountEventArgs): number {
    return root.event;
  }

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    name: "market",
    nullable: false
  })
  getMarket(@TypeGraphQL.Root() root: Market_groupCount, @TypeGraphQL.Args() args: Market_groupCountMarketArgs): number {
    return root.market;
  }
}
