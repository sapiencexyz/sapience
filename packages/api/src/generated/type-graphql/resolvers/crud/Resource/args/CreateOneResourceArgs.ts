import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { ResourceCreateInput } from "../../../inputs/ResourceCreateInput";

@TypeGraphQL.ArgsType()
export class CreateOneResourceArgs {
  @TypeGraphQL.Field(_type => ResourceCreateInput, {
    nullable: false
  })
  data!: ResourceCreateInput;
}
