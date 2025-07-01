import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Crypto_pricesWhereInput } from "../../../inputs/Crypto_pricesWhereInput";

@TypeGraphQL.ArgsType()
export class DeleteManyCrypto_pricesArgs {
  @TypeGraphQL.Field(_type => Crypto_pricesWhereInput, {
    nullable: true
  })
  where?: Crypto_pricesWhereInput | undefined;
}
