import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Market_groupUpdateManyMutationInput } from "../../../inputs/Market_groupUpdateManyMutationInput";
import { Market_groupWhereInput } from "../../../inputs/Market_groupWhereInput";

@TypeGraphQL.ArgsType()
export class UpdateManyMarket_groupArgs {
  @TypeGraphQL.Field(_type => Market_groupUpdateManyMutationInput, {
    nullable: false
  })
  data!: Market_groupUpdateManyMutationInput;

  @TypeGraphQL.Field(_type => Market_groupWhereInput, {
    nullable: true
  })
  where?: Market_groupWhereInput | undefined;
}
