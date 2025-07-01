import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Resource_priceAvgAggregate } from "../outputs/Resource_priceAvgAggregate";
import { Resource_priceCountAggregate } from "../outputs/Resource_priceCountAggregate";
import { Resource_priceMaxAggregate } from "../outputs/Resource_priceMaxAggregate";
import { Resource_priceMinAggregate } from "../outputs/Resource_priceMinAggregate";
import { Resource_priceSumAggregate } from "../outputs/Resource_priceSumAggregate";

@TypeGraphQL.ObjectType("Resource_priceGroupBy", {})
export class Resource_priceGroupBy {
  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: false
  })
  id!: number;

  @TypeGraphQL.Field(_type => Date, {
    nullable: false
  })
  createdAt!: Date;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: false
  })
  blockNumber!: number;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: false
  })
  timestamp!: number;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: false
  })
  value!: Prisma.Decimal;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: false
  })
  used!: Prisma.Decimal;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: false
  })
  feePaid!: Prisma.Decimal;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  resourceId!: number | null;

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
