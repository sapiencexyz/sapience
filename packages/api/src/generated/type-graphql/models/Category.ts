import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../generated/prisma";
import { DecimalJSScalar } from "../scalars";
import { Market_group } from "../models/Market_group";
import { Resource } from "../models/Resource";
import { CategoryCount } from "../resolvers/outputs/CategoryCount";

@TypeGraphQL.ObjectType("Category", {})
export class Category {
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

  market_group?: Market_group[];

  resource?: Resource[];

  @TypeGraphQL.Field(_type => CategoryCount, {
    nullable: true
  })
  _count?: CategoryCount | null;
}
