import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { ResourceWhereInput } from "../../../inputs/ResourceWhereInput";

@TypeGraphQL.ArgsType()
export class DeleteManyResourceArgs {
  @TypeGraphQL.Field(_type => ResourceWhereInput, {
    nullable: true
  })
  where?: ResourceWhereInput | undefined;
}
