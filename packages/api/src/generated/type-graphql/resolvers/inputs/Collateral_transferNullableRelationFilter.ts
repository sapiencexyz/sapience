import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Collateral_transferWhereInput } from "../inputs/Collateral_transferWhereInput";

@TypeGraphQL.InputType("Collateral_transferNullableRelationFilter", {})
export class Collateral_transferNullableRelationFilter {
  @TypeGraphQL.Field(_type => Collateral_transferWhereInput, {
    nullable: true
  })
  is?: Collateral_transferWhereInput | undefined;

  @TypeGraphQL.Field(_type => Collateral_transferWhereInput, {
    nullable: true
  })
  isNot?: Collateral_transferWhereInput | undefined;
}
