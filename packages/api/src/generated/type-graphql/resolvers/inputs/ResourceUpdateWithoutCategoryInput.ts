import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { DateTimeFieldUpdateOperationsInput } from "../inputs/DateTimeFieldUpdateOperationsInput";
import { Market_groupUpdateManyWithoutResourceNestedInput } from "../inputs/Market_groupUpdateManyWithoutResourceNestedInput";
import { Resource_priceUpdateManyWithoutResourceNestedInput } from "../inputs/Resource_priceUpdateManyWithoutResourceNestedInput";
import { StringFieldUpdateOperationsInput } from "../inputs/StringFieldUpdateOperationsInput";

@TypeGraphQL.InputType("ResourceUpdateWithoutCategoryInput", {})
export class ResourceUpdateWithoutCategoryInput {
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

  @TypeGraphQL.Field(_type => Market_groupUpdateManyWithoutResourceNestedInput, {
    nullable: true
  })
  market_group?: Market_groupUpdateManyWithoutResourceNestedInput | undefined;

  @TypeGraphQL.Field(_type => Resource_priceUpdateManyWithoutResourceNestedInput, {
    nullable: true
  })
  resource_price?: Resource_priceUpdateManyWithoutResourceNestedInput | undefined;
}
