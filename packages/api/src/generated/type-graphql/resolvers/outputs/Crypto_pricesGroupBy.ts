import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Crypto_pricesAvgAggregate } from "../outputs/Crypto_pricesAvgAggregate";
import { Crypto_pricesCountAggregate } from "../outputs/Crypto_pricesCountAggregate";
import { Crypto_pricesMaxAggregate } from "../outputs/Crypto_pricesMaxAggregate";
import { Crypto_pricesMinAggregate } from "../outputs/Crypto_pricesMinAggregate";
import { Crypto_pricesSumAggregate } from "../outputs/Crypto_pricesSumAggregate";

@TypeGraphQL.ObjectType("Crypto_pricesGroupBy", {})
export class Crypto_pricesGroupBy {
  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: false
  })
  id!: number;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  ticker!: string | null;

  @TypeGraphQL.Field(_type => TypeGraphQL.Float, {
    nullable: false
  })
  price!: number;

  @TypeGraphQL.Field(_type => Date, {
    nullable: false
  })
  timestamp!: Date;

  @TypeGraphQL.Field(_type => Crypto_pricesCountAggregate, {
    nullable: true
  })
  _count!: Crypto_pricesCountAggregate | null;

  @TypeGraphQL.Field(_type => Crypto_pricesAvgAggregate, {
    nullable: true
  })
  _avg!: Crypto_pricesAvgAggregate | null;

  @TypeGraphQL.Field(_type => Crypto_pricesSumAggregate, {
    nullable: true
  })
  _sum!: Crypto_pricesSumAggregate | null;

  @TypeGraphQL.Field(_type => Crypto_pricesMinAggregate, {
    nullable: true
  })
  _min!: Crypto_pricesMinAggregate | null;

  @TypeGraphQL.Field(_type => Crypto_pricesMaxAggregate, {
    nullable: true
  })
  _max!: Crypto_pricesMaxAggregate | null;
}
