import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { DateTimeWithAggregatesFilter } from "../inputs/DateTimeWithAggregatesFilter";
import { DecimalWithAggregatesFilter } from "../inputs/DecimalWithAggregatesFilter";
import { IntWithAggregatesFilter } from "../inputs/IntWithAggregatesFilter";
import { StringWithAggregatesFilter } from "../inputs/StringWithAggregatesFilter";

@TypeGraphQL.InputType("Collateral_transferScalarWhereWithAggregatesInput", {})
export class Collateral_transferScalarWhereWithAggregatesInput {
  @TypeGraphQL.Field(_type => [Collateral_transferScalarWhereWithAggregatesInput], {
    nullable: true
  })
  AND?: Collateral_transferScalarWhereWithAggregatesInput[] | undefined;

  @TypeGraphQL.Field(_type => [Collateral_transferScalarWhereWithAggregatesInput], {
    nullable: true
  })
  OR?: Collateral_transferScalarWhereWithAggregatesInput[] | undefined;

  @TypeGraphQL.Field(_type => [Collateral_transferScalarWhereWithAggregatesInput], {
    nullable: true
  })
  NOT?: Collateral_transferScalarWhereWithAggregatesInput[] | undefined;

  @TypeGraphQL.Field(_type => IntWithAggregatesFilter, {
    nullable: true
  })
  id?: IntWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => DateTimeWithAggregatesFilter, {
    nullable: true
  })
  createdAt?: DateTimeWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => StringWithAggregatesFilter, {
    nullable: true
  })
  transactionHash?: StringWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => IntWithAggregatesFilter, {
    nullable: true
  })
  timestamp?: IntWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => StringWithAggregatesFilter, {
    nullable: true
  })
  owner?: StringWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalWithAggregatesFilter, {
    nullable: true
  })
  collateral?: DecimalWithAggregatesFilter | undefined;
}
