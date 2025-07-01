import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Collateral_transferOrderByWithRelationInput } from "../../../inputs/Collateral_transferOrderByWithRelationInput";
import { Collateral_transferWhereInput } from "../../../inputs/Collateral_transferWhereInput";
import { Collateral_transferWhereUniqueInput } from "../../../inputs/Collateral_transferWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class AggregateCollateral_transferArgs {
  @TypeGraphQL.Field(_type => Collateral_transferWhereInput, {
    nullable: true
  })
  where?: Collateral_transferWhereInput | undefined;

  @TypeGraphQL.Field(_type => [Collateral_transferOrderByWithRelationInput], {
    nullable: true
  })
  orderBy?: Collateral_transferOrderByWithRelationInput[] | undefined;

  @TypeGraphQL.Field(_type => Collateral_transferWhereUniqueInput, {
    nullable: true
  })
  cursor?: Collateral_transferWhereUniqueInput | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  take?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  skip?: number | undefined;
}
