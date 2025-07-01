import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Cache_paramWhereInput } from "../../../inputs/Cache_paramWhereInput";

@TypeGraphQL.ArgsType()
export class DeleteManyCache_paramArgs {
  @TypeGraphQL.Field(_type => Cache_paramWhereInput, {
    nullable: true
  })
  where?: Cache_paramWhereInput | undefined;
}
