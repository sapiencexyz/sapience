import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../generated/prisma";
import { DecimalJSScalar } from "../scalars";

@TypeGraphQL.ObjectType("Crypto_prices", {})
export class Crypto_prices {
  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: false
  })
  id!: number;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  ticker?: string | null;

  @TypeGraphQL.Field(_type => TypeGraphQL.Float, {
    nullable: false
  })
  price!: number;

  @TypeGraphQL.Field(_type => Date, {
    nullable: false
  })
  timestamp!: Date;
}
