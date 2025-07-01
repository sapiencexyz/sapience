import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { ResourceUpdateInput } from "../../../inputs/ResourceUpdateInput";
import { ResourceWhereUniqueInput } from "../../../inputs/ResourceWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class UpdateOneResourceArgs {
  @TypeGraphQL.Field(_type => ResourceUpdateInput, {
    nullable: false
  })
  data!: ResourceUpdateInput;

  @TypeGraphQL.Field(_type => ResourceWhereUniqueInput, {
    nullable: false
  })
  where!: ResourceWhereUniqueInput;
}
