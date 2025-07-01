import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Resource_priceAvgAggregate } from "../outputs/Resource_priceAvgAggregate";
import { Resource_priceCountAggregate } from "../outputs/Resource_priceCountAggregate";
import { Resource_priceMaxAggregate } from "../outputs/Resource_priceMaxAggregate";
import { Resource_priceMinAggregate } from "../outputs/Resource_priceMinAggregate";
import { Resource_priceSumAggregate } from "../outputs/Resource_priceSumAggregate";

@TypeGraphQL.ObjectType("AggregateResource_price", {})
export class AggregateResource_price {
  @TypeGraphQL.Field(_type => Resource_priceCountAggregate, {
    nullable: true
  })
  _count!: Resource_priceCountAggregate | null;

  @TypeGraphQL.Field(_type => Resource_priceAvgAggregate, {
    nullable: true
  })
  _avg!: Resource_priceAvgAggregate | null;

  @TypeGraphQL.Field(_type => Resource_priceSumAggregate, {
    nullable: true
  })
  _sum!: Resource_priceSumAggregate | null;

  @TypeGraphQL.Field(_type => Resource_priceMinAggregate, {
    nullable: true
  })
  _min!: Resource_priceMinAggregate | null;

  @TypeGraphQL.Field(_type => Resource_priceMaxAggregate, {
    nullable: true
  })
  _max!: Resource_priceMaxAggregate | null;
}
