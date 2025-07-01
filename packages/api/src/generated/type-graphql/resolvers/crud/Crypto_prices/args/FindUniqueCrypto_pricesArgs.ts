import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Crypto_pricesWhereUniqueInput } from "../../../inputs/Crypto_pricesWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class FindUniqueCrypto_pricesArgs {
  @TypeGraphQL.Field(_type => Crypto_pricesWhereUniqueInput, {
    nullable: false
  })
  where!: Crypto_pricesWhereUniqueInput;
}
