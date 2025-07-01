import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { CreateManyAndReturnResourceCategoryArgs } from "./args/CreateManyAndReturnResourceCategoryArgs";
import { Category } from "../../models/Category";

@TypeGraphQL.ObjectType("CreateManyAndReturnResource", {})
export class CreateManyAndReturnResource {
  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: false
  })
  id!: number;

  @TypeGraphQL.Field(_type => Date, {
    nullable: false
  })
  createdAt!: Date;

  @TypeGraphQL.Field(_type => String, {
    nullable: false
  })
  name!: string;

  @TypeGraphQL.Field(_type => String, {
    nullable: false
  })
  slug!: string;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  categoryId!: number | null;

  category!: Category | null;

  @TypeGraphQL.Field(_type => Category, {
    name: "category",
    nullable: true
  })
  getCategory(@TypeGraphQL.Root() root: CreateManyAndReturnResource, @TypeGraphQL.Args() args: CreateManyAndReturnResourceCategoryArgs): Category | null {
    return root.category;
  }
}
