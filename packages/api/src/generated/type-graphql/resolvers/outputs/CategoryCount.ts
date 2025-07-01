import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { CategoryCountMarket_groupArgs } from "./args/CategoryCountMarket_groupArgs";
import { CategoryCountResourceArgs } from "./args/CategoryCountResourceArgs";

@TypeGraphQL.ObjectType("CategoryCount", {})
export class CategoryCount {
  market_group!: number;
  resource!: number;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    name: "market_group",
    nullable: false
  })
  getMarket_group(@TypeGraphQL.Root() root: CategoryCount, @TypeGraphQL.Args() args: CategoryCountMarket_groupArgs): number {
    return root.market_group;
  }

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    name: "resource",
    nullable: false
  })
  getResource(@TypeGraphQL.Root() root: CategoryCount, @TypeGraphQL.Args() args: CategoryCountResourceArgs): number {
    return root.resource;
  }
}
