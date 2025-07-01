import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { CreateManyAndReturnResource_priceResourceArgs } from "./args/CreateManyAndReturnResource_priceResourceArgs";
import { Resource } from "../../models/Resource";

@TypeGraphQL.ObjectType("CreateManyAndReturnResource_price", {})
export class CreateManyAndReturnResource_price {
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

  resource!: Resource | null;

  @TypeGraphQL.Field(_type => Resource, {
    name: "resource",
    nullable: true
  })
  getResource(@TypeGraphQL.Root() root: CreateManyAndReturnResource_price, @TypeGraphQL.Args() args: CreateManyAndReturnResource_priceResourceArgs): Resource | null {
    return root.resource;
  }
}
