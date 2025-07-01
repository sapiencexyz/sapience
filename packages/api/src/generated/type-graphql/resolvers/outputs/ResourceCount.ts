import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { ResourceCountMarket_groupArgs } from "./args/ResourceCountMarket_groupArgs";
import { ResourceCountResource_priceArgs } from "./args/ResourceCountResource_priceArgs";

@TypeGraphQL.ObjectType("ResourceCount", {})
export class ResourceCount {
  market_group!: number;
  resource_price!: number;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    name: "market_group",
    nullable: false
  })
  getMarket_group(@TypeGraphQL.Root() root: ResourceCount, @TypeGraphQL.Args() args: ResourceCountMarket_groupArgs): number {
    return root.market_group;
  }

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    name: "resource_price",
    nullable: false
  })
  getResource_price(@TypeGraphQL.Root() root: ResourceCount, @TypeGraphQL.Args() args: ResourceCountResource_priceArgs): number {
    return root.resource_price;
  }
}
