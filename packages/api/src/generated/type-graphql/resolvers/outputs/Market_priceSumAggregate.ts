import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";

@TypeGraphQL.ObjectType("Market_priceSumAggregate", {})
export class Market_priceSumAggregate {
  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  id!: number | null;

  @TypeGraphQL.Field(_type => GraphQLScalars.BigIntResolver, {
    nullable: true
  })
  timestamp!: bigint | null;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: true
  })
  value!: Prisma.Decimal | null;
}
