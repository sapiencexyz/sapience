import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Crypto_pricesUpdateInput } from "../../../inputs/Crypto_pricesUpdateInput";
import { Crypto_pricesWhereUniqueInput } from "../../../inputs/Crypto_pricesWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class UpdateOneCrypto_pricesArgs {
  @TypeGraphQL.Field(_type => Crypto_pricesUpdateInput, {
    nullable: false
  })
  data!: Crypto_pricesUpdateInput;

  @TypeGraphQL.Field(_type => Crypto_pricesWhereUniqueInput, {
    nullable: false
  })
  where!: Crypto_pricesWhereUniqueInput;
}
