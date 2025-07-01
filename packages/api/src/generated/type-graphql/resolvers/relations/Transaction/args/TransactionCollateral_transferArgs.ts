import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Collateral_transferWhereInput } from "../../../inputs/Collateral_transferWhereInput";

@TypeGraphQL.ArgsType()
export class TransactionCollateral_transferArgs {
  @TypeGraphQL.Field(_type => Collateral_transferWhereInput, {
    nullable: true
  })
  where?: Collateral_transferWhereInput | undefined;
}
