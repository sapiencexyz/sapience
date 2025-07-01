import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Resource_priceWhereUniqueInput } from "../../../inputs/Resource_priceWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class DeleteOneResource_priceArgs {
  @TypeGraphQL.Field(_type => Resource_priceWhereUniqueInput, {
    nullable: false
  })
  where!: Resource_priceWhereUniqueInput;
}
