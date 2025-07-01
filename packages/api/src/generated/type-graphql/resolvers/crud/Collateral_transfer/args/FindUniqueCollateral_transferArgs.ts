import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Collateral_transferWhereUniqueInput } from "../../../inputs/Collateral_transferWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class FindUniqueCollateral_transferArgs {
  @TypeGraphQL.Field(_type => Collateral_transferWhereUniqueInput, {
    nullable: false
  })
  where!: Collateral_transferWhereUniqueInput;
}
