import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { CategoryCreateWithoutResourceInput } from "../inputs/CategoryCreateWithoutResourceInput";
import { CategoryUpdateWithoutResourceInput } from "../inputs/CategoryUpdateWithoutResourceInput";
import { CategoryWhereInput } from "../inputs/CategoryWhereInput";

@TypeGraphQL.InputType("CategoryUpsertWithoutResourceInput", {})
export class CategoryUpsertWithoutResourceInput {
  @TypeGraphQL.Field(_type => CategoryUpdateWithoutResourceInput, {
    nullable: false
  })
  update!: CategoryUpdateWithoutResourceInput;

  @TypeGraphQL.Field(_type => CategoryCreateWithoutResourceInput, {
    nullable: false
  })
  create!: CategoryCreateWithoutResourceInput;

  @TypeGraphQL.Field(_type => CategoryWhereInput, {
    nullable: true
  })
  where?: CategoryWhereInput | undefined;
}
