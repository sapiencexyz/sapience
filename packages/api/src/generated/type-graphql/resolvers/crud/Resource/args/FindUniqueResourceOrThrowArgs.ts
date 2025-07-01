import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { ResourceWhereUniqueInput } from "../../../inputs/ResourceWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class FindUniqueResourceOrThrowArgs {
  @TypeGraphQL.Field(_type => ResourceWhereUniqueInput, {
    nullable: false
  })
  where!: ResourceWhereUniqueInput;
}
