import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Crypto_pricesCreateInput } from "../../../inputs/Crypto_pricesCreateInput";
import { Crypto_pricesUpdateInput } from "../../../inputs/Crypto_pricesUpdateInput";
import { Crypto_pricesWhereUniqueInput } from "../../../inputs/Crypto_pricesWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class UpsertOneCrypto_pricesArgs {
  @TypeGraphQL.Field(_type => Crypto_pricesWhereUniqueInput, {
    nullable: false
  })
  where!: Crypto_pricesWhereUniqueInput;

  @TypeGraphQL.Field(_type => Crypto_pricesCreateInput, {
    nullable: false
  })
  create!: Crypto_pricesCreateInput;

  @TypeGraphQL.Field(_type => Crypto_pricesUpdateInput, {
    nullable: false
  })
  update!: Crypto_pricesUpdateInput;
}
