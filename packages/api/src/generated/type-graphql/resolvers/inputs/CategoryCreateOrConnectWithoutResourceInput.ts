import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { CategoryCreateWithoutResourceInput } from "../inputs/CategoryCreateWithoutResourceInput";
import { CategoryWhereUniqueInput } from "../inputs/CategoryWhereUniqueInput";

@TypeGraphQL.InputType("CategoryCreateOrConnectWithoutResourceInput", {})
export class CategoryCreateOrConnectWithoutResourceInput {
  @TypeGraphQL.Field(_type => CategoryWhereUniqueInput, {
    nullable: false
  })
  where!: CategoryWhereUniqueInput;

  @TypeGraphQL.Field(_type => CategoryCreateWithoutResourceInput, {
    nullable: false
  })
  create!: CategoryCreateWithoutResourceInput;
}
