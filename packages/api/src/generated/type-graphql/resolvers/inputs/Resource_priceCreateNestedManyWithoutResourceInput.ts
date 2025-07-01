import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Resource_priceCreateManyResourceInputEnvelope } from "../inputs/Resource_priceCreateManyResourceInputEnvelope";
import { Resource_priceCreateOrConnectWithoutResourceInput } from "../inputs/Resource_priceCreateOrConnectWithoutResourceInput";
import { Resource_priceCreateWithoutResourceInput } from "../inputs/Resource_priceCreateWithoutResourceInput";
import { Resource_priceWhereUniqueInput } from "../inputs/Resource_priceWhereUniqueInput";

@TypeGraphQL.InputType("Resource_priceCreateNestedManyWithoutResourceInput", {})
export class Resource_priceCreateNestedManyWithoutResourceInput {
  @TypeGraphQL.Field(_type => [Resource_priceCreateWithoutResourceInput], {
    nullable: true
  })
  create?: Resource_priceCreateWithoutResourceInput[] | undefined;

  @TypeGraphQL.Field(_type => [Resource_priceCreateOrConnectWithoutResourceInput], {
    nullable: true
  })
  connectOrCreate?: Resource_priceCreateOrConnectWithoutResourceInput[] | undefined;

  @TypeGraphQL.Field(_type => Resource_priceCreateManyResourceInputEnvelope, {
    nullable: true
  })
  createMany?: Resource_priceCreateManyResourceInputEnvelope | undefined;

  @TypeGraphQL.Field(_type => [Resource_priceWhereUniqueInput], {
    nullable: true
  })
  connect?: Resource_priceWhereUniqueInput[] | undefined;
}
