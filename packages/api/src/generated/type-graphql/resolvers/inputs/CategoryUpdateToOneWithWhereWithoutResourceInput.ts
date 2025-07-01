import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { CategoryUpdateWithoutResourceInput } from "../inputs/CategoryUpdateWithoutResourceInput";
import { CategoryWhereInput } from "../inputs/CategoryWhereInput";

@TypeGraphQL.InputType("CategoryUpdateToOneWithWhereWithoutResourceInput", {})
export class CategoryUpdateToOneWithWhereWithoutResourceInput {
  @TypeGraphQL.Field(_type => CategoryWhereInput, {
    nullable: true
  })
  where?: CategoryWhereInput | undefined;

  @TypeGraphQL.Field(_type => CategoryUpdateWithoutResourceInput, {
    nullable: false
  })
  data!: CategoryUpdateWithoutResourceInput;
}
