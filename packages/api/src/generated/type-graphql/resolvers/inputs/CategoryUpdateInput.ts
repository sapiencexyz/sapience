import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { DateTimeFieldUpdateOperationsInput } from "../inputs/DateTimeFieldUpdateOperationsInput";
import { Market_groupUpdateManyWithoutCategoryNestedInput } from "../inputs/Market_groupUpdateManyWithoutCategoryNestedInput";
import { ResourceUpdateManyWithoutCategoryNestedInput } from "../inputs/ResourceUpdateManyWithoutCategoryNestedInput";
import { StringFieldUpdateOperationsInput } from "../inputs/StringFieldUpdateOperationsInput";

@TypeGraphQL.InputType("CategoryUpdateInput", {})
export class CategoryUpdateInput {
  @TypeGraphQL.Field(_type => DateTimeFieldUpdateOperationsInput, {
    nullable: true
  })
  createdAt?: DateTimeFieldUpdateOperationsInput | undefined;

  @TypeGraphQL.Field(_type => StringFieldUpdateOperationsInput, {
    nullable: true
  })
  name?: StringFieldUpdateOperationsInput | undefined;

  @TypeGraphQL.Field(_type => StringFieldUpdateOperationsInput, {
    nullable: true
  })
  slug?: StringFieldUpdateOperationsInput | undefined;

  @TypeGraphQL.Field(_type => Market_groupUpdateManyWithoutCategoryNestedInput, {
    nullable: true
  })
  market_group?: Market_groupUpdateManyWithoutCategoryNestedInput | undefined;

  @TypeGraphQL.Field(_type => ResourceUpdateManyWithoutCategoryNestedInput, {
    nullable: true
  })
  resource?: ResourceUpdateManyWithoutCategoryNestedInput | undefined;
}
