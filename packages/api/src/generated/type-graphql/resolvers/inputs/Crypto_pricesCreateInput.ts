import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";

@TypeGraphQL.InputType("Crypto_pricesCreateInput", {})
export class Crypto_pricesCreateInput {
  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  ticker?: string | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Float, {
    nullable: false
  })
  price!: number;

  @TypeGraphQL.Field(_type => Date, {
    nullable: true
  })
  timestamp?: Date | undefined;
}
