import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Resource_priceWhereUniqueInput } from "../../../inputs/Resource_priceWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class FindUniqueResource_priceOrThrowArgs {
  @TypeGraphQL.Field(_type => Resource_priceWhereUniqueInput, {
    nullable: false
  })
  where!: Resource_priceWhereUniqueInput;
}
