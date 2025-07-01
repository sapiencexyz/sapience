import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Resource_priceOrderByWithRelationInput } from "../../../inputs/Resource_priceOrderByWithRelationInput";
import { Resource_priceWhereInput } from "../../../inputs/Resource_priceWhereInput";
import { Resource_priceWhereUniqueInput } from "../../../inputs/Resource_priceWhereUniqueInput";
import { Resource_priceScalarFieldEnum } from "../../../../enums/Resource_priceScalarFieldEnum";

@TypeGraphQL.ArgsType()
export class FindFirstResource_priceArgs {
  @TypeGraphQL.Field(_type => Resource_priceWhereInput, {
    nullable: true
  })
  where?: Resource_priceWhereInput | undefined;

  @TypeGraphQL.Field(_type => [Resource_priceOrderByWithRelationInput], {
    nullable: true
  })
  orderBy?: Resource_priceOrderByWithRelationInput[] | undefined;

  @TypeGraphQL.Field(_type => Resource_priceWhereUniqueInput, {
    nullable: true
  })
  cursor?: Resource_priceWhereUniqueInput | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  take?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  skip?: number | undefined;

  @TypeGraphQL.Field(_type => [Resource_priceScalarFieldEnum], {
    nullable: true
  })
  distinct?: Array<"id" | "createdAt" | "blockNumber" | "timestamp" | "value" | "used" | "feePaid" | "resourceId"> | undefined;
}
