import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { CategoryCreateOrConnectWithoutResourceInput } from "../inputs/CategoryCreateOrConnectWithoutResourceInput";
import { CategoryCreateWithoutResourceInput } from "../inputs/CategoryCreateWithoutResourceInput";
import { CategoryUpdateToOneWithWhereWithoutResourceInput } from "../inputs/CategoryUpdateToOneWithWhereWithoutResourceInput";
import { CategoryUpsertWithoutResourceInput } from "../inputs/CategoryUpsertWithoutResourceInput";
import { CategoryWhereInput } from "../inputs/CategoryWhereInput";
import { CategoryWhereUniqueInput } from "../inputs/CategoryWhereUniqueInput";

@TypeGraphQL.InputType("CategoryUpdateOneWithoutResourceNestedInput", {})
export class CategoryUpdateOneWithoutResourceNestedInput {
  @TypeGraphQL.Field(_type => CategoryCreateWithoutResourceInput, {
    nullable: true
  })
  create?: CategoryCreateWithoutResourceInput | undefined;

  @TypeGraphQL.Field(_type => CategoryCreateOrConnectWithoutResourceInput, {
    nullable: true
  })
  connectOrCreate?: CategoryCreateOrConnectWithoutResourceInput | undefined;

  @TypeGraphQL.Field(_type => CategoryUpsertWithoutResourceInput, {
    nullable: true
  })
  upsert?: CategoryUpsertWithoutResourceInput | undefined;

  @TypeGraphQL.Field(_type => CategoryWhereInput, {
    nullable: true
  })
  disconnect?: CategoryWhereInput | undefined;

  @TypeGraphQL.Field(_type => CategoryWhereInput, {
    nullable: true
  })
  delete?: CategoryWhereInput | undefined;

  @TypeGraphQL.Field(_type => CategoryWhereUniqueInput, {
    nullable: true
  })
  connect?: CategoryWhereUniqueInput | undefined;

  @TypeGraphQL.Field(_type => CategoryUpdateToOneWithWhereWithoutResourceInput, {
    nullable: true
  })
  update?: CategoryUpdateToOneWithWhereWithoutResourceInput | undefined;
}
