import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Market_priceOrderByWithRelationInput } from "../../../inputs/Market_priceOrderByWithRelationInput";
import { Market_priceWhereInput } from "../../../inputs/Market_priceWhereInput";
import { Market_priceWhereUniqueInput } from "../../../inputs/Market_priceWhereUniqueInput";
import { Market_priceScalarFieldEnum } from "../../../../enums/Market_priceScalarFieldEnum";

@TypeGraphQL.ArgsType()
export class FindFirstMarket_priceOrThrowArgs {
  @TypeGraphQL.Field(_type => Market_priceWhereInput, {
    nullable: true
  })
  where?: Market_priceWhereInput | undefined;

  @TypeGraphQL.Field(_type => [Market_priceOrderByWithRelationInput], {
    nullable: true
  })
  orderBy?: Market_priceOrderByWithRelationInput[] | undefined;

  @TypeGraphQL.Field(_type => Market_priceWhereUniqueInput, {
    nullable: true
  })
  cursor?: Market_priceWhereUniqueInput | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  take?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  skip?: number | undefined;

  @TypeGraphQL.Field(_type => [Market_priceScalarFieldEnum], {
    nullable: true
  })
  distinct?: Array<"id" | "createdAt" | "timestamp" | "value"> | undefined;
}
