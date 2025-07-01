import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { PositionScalarWhereInput } from "../inputs/PositionScalarWhereInput";
import { PositionUpdateManyMutationInput } from "../inputs/PositionUpdateManyMutationInput";

@TypeGraphQL.InputType("PositionUpdateManyWithWhereWithoutMarketInput", {})
export class PositionUpdateManyWithWhereWithoutMarketInput {
  @TypeGraphQL.Field(_type => PositionScalarWhereInput, {
    nullable: false
  })
  where!: PositionScalarWhereInput;

  @TypeGraphQL.Field(_type => PositionUpdateManyMutationInput, {
    nullable: false
  })
  data!: PositionUpdateManyMutationInput;
}
