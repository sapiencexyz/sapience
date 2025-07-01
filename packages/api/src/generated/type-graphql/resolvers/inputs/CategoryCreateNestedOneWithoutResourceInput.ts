import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { CategoryCreateOrConnectWithoutResourceInput } from "../inputs/CategoryCreateOrConnectWithoutResourceInput";
import { CategoryCreateWithoutResourceInput } from "../inputs/CategoryCreateWithoutResourceInput";
import { CategoryWhereUniqueInput } from "../inputs/CategoryWhereUniqueInput";

@TypeGraphQL.InputType("CategoryCreateNestedOneWithoutResourceInput", {})
export class CategoryCreateNestedOneWithoutResourceInput {
  @TypeGraphQL.Field(_type => CategoryCreateWithoutResourceInput, {
    nullable: true
  })
  create?: CategoryCreateWithoutResourceInput | undefined;

  @TypeGraphQL.Field(_type => CategoryCreateOrConnectWithoutResourceInput, {
    nullable: true
  })
  connectOrCreate?: CategoryCreateOrConnectWithoutResourceInput | undefined;

  @TypeGraphQL.Field(_type => CategoryWhereUniqueInput, {
    nullable: true
  })
  connect?: CategoryWhereUniqueInput | undefined;
}
