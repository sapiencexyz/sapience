import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { CategoryUpdateOneWithoutResourceNestedInput } from "../inputs/CategoryUpdateOneWithoutResourceNestedInput";
import { DateTimeFieldUpdateOperationsInput } from "../inputs/DateTimeFieldUpdateOperationsInput";
import { Market_groupUpdateManyWithoutResourceNestedInput } from "../inputs/Market_groupUpdateManyWithoutResourceNestedInput";
import { StringFieldUpdateOperationsInput } from "../inputs/StringFieldUpdateOperationsInput";

@TypeGraphQL.InputType("ResourceUpdateWithoutResource_priceInput", {})
export class ResourceUpdateWithoutResource_priceInput {
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

  @TypeGraphQL.Field(_type => CategoryUpdateOneWithoutResourceNestedInput, {
    nullable: true
  })
  category?: CategoryUpdateOneWithoutResourceNestedInput | undefined;
}
