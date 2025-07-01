import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { PositionWhereInput } from "../inputs/PositionWhereInput";

@TypeGraphQL.InputType("PositionListRelationFilter", {})
export class PositionListRelationFilter {
  @TypeGraphQL.Field(_type => PositionWhereInput, {
    nullable: true
  })
  every?: PositionWhereInput | undefined;

  @TypeGraphQL.Field(_type => PositionWhereInput, {
    nullable: true
  })
  some?: PositionWhereInput | undefined;

  @TypeGraphQL.Field(_type => PositionWhereInput, {
    nullable: true
  })
  none?: PositionWhereInput | undefined;
}
