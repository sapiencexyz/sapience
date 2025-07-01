import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Crypto_pricesOrderByWithRelationInput } from "../../../inputs/Crypto_pricesOrderByWithRelationInput";
import { Crypto_pricesWhereInput } from "../../../inputs/Crypto_pricesWhereInput";
import { Crypto_pricesWhereUniqueInput } from "../../../inputs/Crypto_pricesWhereUniqueInput";
import { Crypto_pricesScalarFieldEnum } from "../../../../enums/Crypto_pricesScalarFieldEnum";

@TypeGraphQL.ArgsType()
export class FindFirstCrypto_pricesArgs {
  @TypeGraphQL.Field(_type => Crypto_pricesWhereInput, {
    nullable: true
  })
  where?: Crypto_pricesWhereInput | undefined;

  @TypeGraphQL.Field(_type => [Crypto_pricesOrderByWithRelationInput], {
    nullable: true
  })
  orderBy?: Crypto_pricesOrderByWithRelationInput[] | undefined;

  @TypeGraphQL.Field(_type => Crypto_pricesWhereUniqueInput, {
    nullable: true
  })
  cursor?: Crypto_pricesWhereUniqueInput | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  take?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  skip?: number | undefined;

  @TypeGraphQL.Field(_type => [Crypto_pricesScalarFieldEnum], {
    nullable: true
  })
  distinct?: Array<"id" | "ticker" | "price" | "timestamp"> | undefined;
}
