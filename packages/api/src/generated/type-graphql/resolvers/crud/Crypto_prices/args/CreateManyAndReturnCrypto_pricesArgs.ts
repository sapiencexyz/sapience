import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Crypto_pricesCreateManyInput } from "../../../inputs/Crypto_pricesCreateManyInput";

@TypeGraphQL.ArgsType()
export class CreateManyAndReturnCrypto_pricesArgs {
  @TypeGraphQL.Field(_type => [Crypto_pricesCreateManyInput], {
    nullable: false
  })
  data!: Crypto_pricesCreateManyInput[];

  @TypeGraphQL.Field(_type => Boolean, {
    nullable: true
  })
  skipDuplicates?: boolean | undefined;
}
