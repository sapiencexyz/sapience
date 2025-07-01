import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Market_groupCreateInput } from "../../../inputs/Market_groupCreateInput";
import { Market_groupUpdateInput } from "../../../inputs/Market_groupUpdateInput";
import { Market_groupWhereUniqueInput } from "../../../inputs/Market_groupWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class UpsertOneMarket_groupArgs {
  @TypeGraphQL.Field(_type => Market_groupWhereUniqueInput, {
    nullable: false
  })
  where!: Market_groupWhereUniqueInput;

  @TypeGraphQL.Field(_type => Market_groupCreateInput, {
    nullable: false
  })
  create!: Market_groupCreateInput;

  @TypeGraphQL.Field(_type => Market_groupUpdateInput, {
    nullable: false
  })
  update!: Market_groupUpdateInput;
}
