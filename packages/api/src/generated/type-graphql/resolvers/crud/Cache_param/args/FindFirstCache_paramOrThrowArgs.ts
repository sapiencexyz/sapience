import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Cache_paramOrderByWithRelationInput } from "../../../inputs/Cache_paramOrderByWithRelationInput";
import { Cache_paramWhereInput } from "../../../inputs/Cache_paramWhereInput";
import { Cache_paramWhereUniqueInput } from "../../../inputs/Cache_paramWhereUniqueInput";
import { Cache_paramScalarFieldEnum } from "../../../../enums/Cache_paramScalarFieldEnum";

@TypeGraphQL.ArgsType()
export class FindFirstCache_paramOrThrowArgs {
  @TypeGraphQL.Field(_type => Cache_paramWhereInput, {
    nullable: true
  })
  where?: Cache_paramWhereInput | undefined;

  @TypeGraphQL.Field(_type => [Cache_paramOrderByWithRelationInput], {
    nullable: true
  })
  orderBy?: Cache_paramOrderByWithRelationInput[] | undefined;

  @TypeGraphQL.Field(_type => Cache_paramWhereUniqueInput, {
    nullable: true
  })
  cursor?: Cache_paramWhereUniqueInput | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  take?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  skip?: number | undefined;

  @TypeGraphQL.Field(_type => [Cache_paramScalarFieldEnum], {
    nullable: true
  })
  distinct?: Array<"id" | "createdAt" | "paramName" | "paramValueNumber" | "paramValueString"> | undefined;
}
