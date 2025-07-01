import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Crypto_pricesUpdateManyMutationInput } from "../../../inputs/Crypto_pricesUpdateManyMutationInput";
import { Crypto_pricesWhereInput } from "../../../inputs/Crypto_pricesWhereInput";

@TypeGraphQL.ArgsType()
export class UpdateManyCrypto_pricesArgs {
  @TypeGraphQL.Field(_type => Crypto_pricesUpdateManyMutationInput, {
    nullable: false
  })
  data!: Crypto_pricesUpdateManyMutationInput;

  @TypeGraphQL.Field(_type => Crypto_pricesWhereInput, {
    nullable: true
  })
  where?: Crypto_pricesWhereInput | undefined;
}
