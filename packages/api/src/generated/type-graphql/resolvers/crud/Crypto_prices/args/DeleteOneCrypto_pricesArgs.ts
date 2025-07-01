import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Crypto_pricesWhereUniqueInput } from "../../../inputs/Crypto_pricesWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class DeleteOneCrypto_pricesArgs {
  @TypeGraphQL.Field(_type => Crypto_pricesWhereUniqueInput, {
    nullable: false
  })
  where!: Crypto_pricesWhereUniqueInput;
}
