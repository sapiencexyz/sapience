import * as TypeGraphQL from "type-graphql";

export enum CategoryScalarFieldEnum {
  id = "id",
  createdAt = "createdAt",
  name = "name",
  slug = "slug"
}
TypeGraphQL.registerEnumType(CategoryScalarFieldEnum, {
  name: "CategoryScalarFieldEnum",
  description: undefined,
});
