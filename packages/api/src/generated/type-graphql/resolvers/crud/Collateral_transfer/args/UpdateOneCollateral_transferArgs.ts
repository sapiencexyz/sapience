import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Collateral_transferUpdateInput } from "../../../inputs/Collateral_transferUpdateInput";
import { Collateral_transferWhereUniqueInput } from "../../../inputs/Collateral_transferWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class UpdateOneCollateral_transferArgs {
  @TypeGraphQL.Field(_type => Collateral_transferUpdateInput, {
    nullable: false
  })
  data!: Collateral_transferUpdateInput;

  @TypeGraphQL.Field(_type => Collateral_transferWhereUniqueInput, {
    nullable: false
  })
  where!: Collateral_transferWhereUniqueInput;
}
