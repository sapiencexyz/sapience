import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Resource_priceCreateInput } from "../../../inputs/Resource_priceCreateInput";

@TypeGraphQL.ArgsType()
export class CreateOneResource_priceArgs {
  @TypeGraphQL.Field(_type => Resource_priceCreateInput, {
    nullable: false
  })
  data!: Resource_priceCreateInput;
}
