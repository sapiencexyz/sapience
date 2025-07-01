import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { ResourceCreateInput } from "../../../inputs/ResourceCreateInput";
import { ResourceUpdateInput } from "../../../inputs/ResourceUpdateInput";
import { ResourceWhereUniqueInput } from "../../../inputs/ResourceWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class UpsertOneResourceArgs {
  @TypeGraphQL.Field(_type => ResourceWhereUniqueInput, {
    nullable: false
  })
  where!: ResourceWhereUniqueInput;

  @TypeGraphQL.Field(_type => ResourceCreateInput, {
    nullable: false
  })
  create!: ResourceCreateInput;

  @TypeGraphQL.Field(_type => ResourceUpdateInput, {
    nullable: false
  })
  update!: ResourceUpdateInput;
}
