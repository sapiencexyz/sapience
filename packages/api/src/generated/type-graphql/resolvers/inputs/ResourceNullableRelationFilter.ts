import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { ResourceWhereInput } from "../inputs/ResourceWhereInput";

@TypeGraphQL.InputType("ResourceNullableRelationFilter", {})
export class ResourceNullableRelationFilter {
  @TypeGraphQL.Field(_type => ResourceWhereInput, {
    nullable: true
  })
  is?: ResourceWhereInput | undefined;

  @TypeGraphQL.Field(_type => ResourceWhereInput, {
    nullable: true
  })
  isNot?: ResourceWhereInput | undefined;
}
