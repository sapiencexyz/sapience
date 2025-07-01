import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { MarketCountPositionArgs } from "./args/MarketCountPositionArgs";

@TypeGraphQL.ObjectType("MarketCount", {})
export class MarketCount {
  position!: number;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    name: "position",
    nullable: false
  })
  getPosition(@TypeGraphQL.Root() root: MarketCount, @TypeGraphQL.Args() args: MarketCountPositionArgs): number {
    return root.position;
  }
}
