import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Cache_candleWhereInput } from "../../../inputs/Cache_candleWhereInput";

@TypeGraphQL.ArgsType()
export class DeleteManyCache_candleArgs {
  @TypeGraphQL.Field(_type => Cache_candleWhereInput, {
    nullable: true
  })
  where?: Cache_candleWhereInput | undefined;
}
