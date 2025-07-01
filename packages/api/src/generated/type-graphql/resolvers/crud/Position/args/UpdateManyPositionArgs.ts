import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { PositionUpdateManyMutationInput } from "../../../inputs/PositionUpdateManyMutationInput";
import { PositionWhereInput } from "../../../inputs/PositionWhereInput";

@TypeGraphQL.ArgsType()
export class UpdateManyPositionArgs {
  @TypeGraphQL.Field(_type => PositionUpdateManyMutationInput, {
    nullable: false
  })
  data!: PositionUpdateManyMutationInput;

  @TypeGraphQL.Field(_type => PositionWhereInput, {
    nullable: true
  })
  where?: PositionWhereInput | undefined;
}
