import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Crypto_pricesOrderByWithAggregationInput } from "../../../inputs/Crypto_pricesOrderByWithAggregationInput";
import { Crypto_pricesScalarWhereWithAggregatesInput } from "../../../inputs/Crypto_pricesScalarWhereWithAggregatesInput";
import { Crypto_pricesWhereInput } from "../../../inputs/Crypto_pricesWhereInput";
import { Crypto_pricesScalarFieldEnum } from "../../../../enums/Crypto_pricesScalarFieldEnum";

@TypeGraphQL.ArgsType()
export class GroupByCrypto_pricesArgs {
  @TypeGraphQL.Field(_type => Crypto_pricesWhereInput, {
    nullable: true
  })
  where?: Crypto_pricesWhereInput | undefined;

  @TypeGraphQL.Field(_type => [Crypto_pricesOrderByWithAggregationInput], {
    nullable: true
  })
  orderBy?: Crypto_pricesOrderByWithAggregationInput[] | undefined;

  @TypeGraphQL.Field(_type => [Crypto_pricesScalarFieldEnum], {
    nullable: false
  })
  by!: Array<"id" | "ticker" | "price" | "timestamp">;

  @TypeGraphQL.Field(_type => Crypto_pricesScalarWhereWithAggregatesInput, {
    nullable: true
  })
  having?: Crypto_pricesScalarWhereWithAggregatesInput | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  take?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  skip?: number | undefined;
}
