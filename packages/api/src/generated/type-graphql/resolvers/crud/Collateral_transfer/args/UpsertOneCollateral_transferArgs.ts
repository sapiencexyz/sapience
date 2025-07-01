import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Collateral_transferCreateInput } from "../../../inputs/Collateral_transferCreateInput";
import { Collateral_transferUpdateInput } from "../../../inputs/Collateral_transferUpdateInput";
import { Collateral_transferWhereUniqueInput } from "../../../inputs/Collateral_transferWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class UpsertOneCollateral_transferArgs {
  @TypeGraphQL.Field(_type => Collateral_transferWhereUniqueInput, {
    nullable: false
  })
  where!: Collateral_transferWhereUniqueInput;

  @TypeGraphQL.Field(_type => Collateral_transferCreateInput, {
    nullable: false
  })
  create!: Collateral_transferCreateInput;

  @TypeGraphQL.Field(_type => Collateral_transferUpdateInput, {
    nullable: false
  })
  update!: Collateral_transferUpdateInput;
}
