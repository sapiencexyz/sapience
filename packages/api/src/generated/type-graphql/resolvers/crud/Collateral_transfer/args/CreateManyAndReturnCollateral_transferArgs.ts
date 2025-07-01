import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Collateral_transferCreateManyInput } from "../../../inputs/Collateral_transferCreateManyInput";

@TypeGraphQL.ArgsType()
export class CreateManyAndReturnCollateral_transferArgs {
  @TypeGraphQL.Field(_type => [Collateral_transferCreateManyInput], {
    nullable: false
  })
  data!: Collateral_transferCreateManyInput[];

  @TypeGraphQL.Field(_type => Boolean, {
    nullable: true
  })
  skipDuplicates?: boolean | undefined;
}
