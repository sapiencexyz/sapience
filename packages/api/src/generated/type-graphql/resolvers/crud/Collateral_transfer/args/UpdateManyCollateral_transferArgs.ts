import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Collateral_transferUpdateManyMutationInput } from "../../../inputs/Collateral_transferUpdateManyMutationInput";
import { Collateral_transferWhereInput } from "../../../inputs/Collateral_transferWhereInput";

@TypeGraphQL.ArgsType()
export class UpdateManyCollateral_transferArgs {
  @TypeGraphQL.Field(_type => Collateral_transferUpdateManyMutationInput, {
    nullable: false
  })
  data!: Collateral_transferUpdateManyMutationInput;

  @TypeGraphQL.Field(_type => Collateral_transferWhereInput, {
    nullable: true
  })
  where?: Collateral_transferWhereInput | undefined;
}
