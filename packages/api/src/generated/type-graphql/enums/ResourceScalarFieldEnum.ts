import * as TypeGraphQL from "type-graphql";

export enum ResourceScalarFieldEnum {
  id = "id",
  createdAt = "createdAt",
  name = "name",
  slug = "slug",
  categoryId = "categoryId"
}
TypeGraphQL.registerEnumType(ResourceScalarFieldEnum, {
  name: "ResourceScalarFieldEnum",
  description: undefined,
});
