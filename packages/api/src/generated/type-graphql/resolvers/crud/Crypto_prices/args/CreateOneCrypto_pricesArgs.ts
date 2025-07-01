import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Crypto_pricesCreateInput } from "../../../inputs/Crypto_pricesCreateInput";

@TypeGraphQL.ArgsType()
export class CreateOneCrypto_pricesArgs {
  @TypeGraphQL.Field(_type => Crypto_pricesCreateInput, {
    nullable: false
  })
  data!: Crypto_pricesCreateInput;
}
