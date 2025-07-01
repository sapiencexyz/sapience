import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { ResourceOrderByWithRelationInput } from "../../../inputs/ResourceOrderByWithRelationInput";
import { ResourceWhereInput } from "../../../inputs/ResourceWhereInput";
import { ResourceWhereUniqueInput } from "../../../inputs/ResourceWhereUniqueInput";
import { ResourceScalarFieldEnum } from "../../../../enums/ResourceScalarFieldEnum";

@TypeGraphQL.ArgsType()
export class CategoryResourceArgs {
  @TypeGraphQL.Field(_type => ResourceWhereInput, {
    nullable: true
  })
  where?: ResourceWhereInput | undefined;

  @TypeGraphQL.Field(_type => [ResourceOrderByWithRelationInput], {
    nullable: true
  })
  orderBy?: ResourceOrderByWithRelationInput[] | undefined;

  @TypeGraphQL.Field(_type => ResourceWhereUniqueInput, {
    nullable: true
  })
  cursor?: ResourceWhereUniqueInput | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  take?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  skip?: number | undefined;

  @TypeGraphQL.Field(_type => [ResourceScalarFieldEnum], {
    nullable: true
  })
  distinct?: Array<"id" | "createdAt" | "name" | "slug" | "categoryId"> | undefined;
}
