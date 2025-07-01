import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { ResourceUpdateManyMutationInput } from "../../../inputs/ResourceUpdateManyMutationInput";
import { ResourceWhereInput } from "../../../inputs/ResourceWhereInput";

@TypeGraphQL.ArgsType()
export class UpdateManyResourceArgs {
  @TypeGraphQL.Field(_type => ResourceUpdateManyMutationInput, {
    nullable: false
  })
  data!: ResourceUpdateManyMutationInput;

  @TypeGraphQL.Field(_type => ResourceWhereInput, {
    nullable: true
  })
  where?: ResourceWhereInput | undefined;
}
