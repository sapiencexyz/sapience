import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { ResourceCreateNestedOneWithoutResource_priceInput } from "../inputs/ResourceCreateNestedOneWithoutResource_priceInput";

@TypeGraphQL.InputType("Resource_priceCreateInput", {})
export class Resource_priceCreateInput {
  @TypeGraphQL.Field(_type => Date, {
    nullable: true
  })
  createdAt?: Date | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: false
  })
  blockNumber!: number;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: false
  })
  timestamp!: number;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: false
  })
  value!: Prisma.Decimal;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: false
  })
  used!: Prisma.Decimal;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: false
  })
  feePaid!: Prisma.Decimal;

  @TypeGraphQL.Field(_type => ResourceCreateNestedOneWithoutResource_priceInput, {
    nullable: true
  })
  resource?: ResourceCreateNestedOneWithoutResource_priceInput | undefined;
}
