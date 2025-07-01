import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../generated/prisma";
import { DecimalJSScalar } from "../scalars";
import { Category } from "../models/Category";
import { Market_group } from "../models/Market_group";
import { Resource_price } from "../models/Resource_price";
import { ResourceCount } from "../resolvers/outputs/ResourceCount";

@TypeGraphQL.ObjectType("Resource", {})
export class Resource {
  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: false
  })
  id!: number;

  @TypeGraphQL.Field(_type => Date, {
    nullable: false
  })
  createdAt!: Date;

  @TypeGraphQL.Field(_type => String, {
    nullable: false
  })
  name!: string;

  @TypeGraphQL.Field(_type => String, {
    nullable: false
  })
  slug!: string;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  categoryId?: number | null;

  market_group?: Market_group[];

  category?: Category | null;

  resource_price?: Resource_price[];

  @TypeGraphQL.Field(_type => ResourceCount, {
    nullable: true
  })
  _count?: ResourceCount | null;
}
