import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { ResourceWhereInput } from "../inputs/ResourceWhereInput";

@TypeGraphQL.InputType("ResourceListRelationFilter", {})
export class ResourceListRelationFilter {
  @TypeGraphQL.Field(_type => ResourceWhereInput, {
    nullable: true
  })
  every?: ResourceWhereInput | undefined;

  @TypeGraphQL.Field(_type => ResourceWhereInput, {
    nullable: true
  })
  some?: ResourceWhereInput | undefined;

  @TypeGraphQL.Field(_type => ResourceWhereInput, {
    nullable: true
  })
  none?: ResourceWhereInput | undefined;
}
