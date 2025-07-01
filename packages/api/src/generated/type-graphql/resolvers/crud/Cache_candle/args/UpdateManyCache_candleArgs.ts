import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Cache_candleUpdateManyMutationInput } from "../../../inputs/Cache_candleUpdateManyMutationInput";
import { Cache_candleWhereInput } from "../../../inputs/Cache_candleWhereInput";

@TypeGraphQL.ArgsType()
export class UpdateManyCache_candleArgs {
  @TypeGraphQL.Field(_type => Cache_candleUpdateManyMutationInput, {
    nullable: false
  })
  data!: Cache_candleUpdateManyMutationInput;

  @TypeGraphQL.Field(_type => Cache_candleWhereInput, {
    nullable: true
  })
  where?: Cache_candleWhereInput | undefined;
}
