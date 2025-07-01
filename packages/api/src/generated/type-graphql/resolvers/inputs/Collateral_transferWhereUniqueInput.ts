import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Collateral_transferWhereInput } from "../inputs/Collateral_transferWhereInput";
import { DateTimeFilter } from "../inputs/DateTimeFilter";
import { DecimalFilter } from "../inputs/DecimalFilter";
import { IntFilter } from "../inputs/IntFilter";
import { StringFilter } from "../inputs/StringFilter";
import { TransactionNullableRelationFilter } from "../inputs/TransactionNullableRelationFilter";

@TypeGraphQL.InputType("Collateral_transferWhereUniqueInput", {})
export class Collateral_transferWhereUniqueInput {
  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  id?: number | undefined;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  transactionHash?: string | undefined;

  @TypeGraphQL.Field(_type => [Collateral_transferWhereInput], {
    nullable: true
  })
  AND?: Collateral_transferWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [Collateral_transferWhereInput], {
    nullable: true
  })
  OR?: Collateral_transferWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [Collateral_transferWhereInput], {
    nullable: true
  })
  NOT?: Collateral_transferWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => DateTimeFilter, {
    nullable: true
  })
  createdAt?: DateTimeFilter | undefined;

  @TypeGraphQL.Field(_type => IntFilter, {
    nullable: true
  })
  timestamp?: IntFilter | undefined;

  @TypeGraphQL.Field(_type => StringFilter, {
    nullable: true
  })
  owner?: StringFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalFilter, {
    nullable: true
  })
  collateral?: DecimalFilter | undefined;

  @TypeGraphQL.Field(_type => TransactionNullableRelationFilter, {
    nullable: true
  })
  transaction?: TransactionNullableRelationFilter | undefined;
}
