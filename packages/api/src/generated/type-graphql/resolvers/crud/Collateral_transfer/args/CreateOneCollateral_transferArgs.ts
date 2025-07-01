import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Collateral_transferCreateInput } from "../../../inputs/Collateral_transferCreateInput";

@TypeGraphQL.ArgsType()
export class CreateOneCollateral_transferArgs {
  @TypeGraphQL.Field(_type => Collateral_transferCreateInput, {
    nullable: false
  })
  data!: Collateral_transferCreateInput;
}
