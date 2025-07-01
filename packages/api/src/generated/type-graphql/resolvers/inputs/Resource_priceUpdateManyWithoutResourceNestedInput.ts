import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Resource_priceCreateManyResourceInputEnvelope } from "../inputs/Resource_priceCreateManyResourceInputEnvelope";
import { Resource_priceCreateOrConnectWithoutResourceInput } from "../inputs/Resource_priceCreateOrConnectWithoutResourceInput";
import { Resource_priceCreateWithoutResourceInput } from "../inputs/Resource_priceCreateWithoutResourceInput";
import { Resource_priceScalarWhereInput } from "../inputs/Resource_priceScalarWhereInput";
import { Resource_priceUpdateManyWithWhereWithoutResourceInput } from "../inputs/Resource_priceUpdateManyWithWhereWithoutResourceInput";
import { Resource_priceUpdateWithWhereUniqueWithoutResourceInput } from "../inputs/Resource_priceUpdateWithWhereUniqueWithoutResourceInput";
import { Resource_priceUpsertWithWhereUniqueWithoutResourceInput } from "../inputs/Resource_priceUpsertWithWhereUniqueWithoutResourceInput";
import { Resource_priceWhereUniqueInput } from "../inputs/Resource_priceWhereUniqueInput";

@TypeGraphQL.InputType("Resource_priceUpdateManyWithoutResourceNestedInput", {})
export class Resource_priceUpdateManyWithoutResourceNestedInput {
  @TypeGraphQL.Field(_type => [Resource_priceCreateWithoutResourceInput], {
    nullable: true
  })
  create?: Resource_priceCreateWithoutResourceInput[] | undefined;

  @TypeGraphQL.Field(_type => [Resource_priceCreateOrConnectWithoutResourceInput], {
    nullable: true
  })
  connectOrCreate?: Resource_priceCreateOrConnectWithoutResourceInput[] | undefined;

  @TypeGraphQL.Field(_type => [Resource_priceUpsertWithWhereUniqueWithoutResourceInput], {
    nullable: true
  })
  upsert?: Resource_priceUpsertWithWhereUniqueWithoutResourceInput[] | undefined;

  @TypeGraphQL.Field(_type => Resource_priceCreateManyResourceInputEnvelope, {
    nullable: true
  })
  createMany?: Resource_priceCreateManyResourceInputEnvelope | undefined;

  @TypeGraphQL.Field(_type => [Resource_priceWhereUniqueInput], {
    nullable: true
  })
  set?: Resource_priceWhereUniqueInput[] | undefined;

  @TypeGraphQL.Field(_type => [Resource_priceWhereUniqueInput], {
    nullable: true
  })
  disconnect?: Resource_priceWhereUniqueInput[] | undefined;

  @TypeGraphQL.Field(_type => [Resource_priceWhereUniqueInput], {
    nullable: true
  })
  delete?: Resource_priceWhereUniqueInput[] | undefined;

  @TypeGraphQL.Field(_type => [Resource_priceWhereUniqueInput], {
    nullable: true
  })
  connect?: Resource_priceWhereUniqueInput[] | undefined;

  @TypeGraphQL.Field(_type => [Resource_priceUpdateWithWhereUniqueWithoutResourceInput], {
    nullable: true
  })
  update?: Resource_priceUpdateWithWhereUniqueWithoutResourceInput[] | undefined;

  @TypeGraphQL.Field(_type => [Resource_priceUpdateManyWithWhereWithoutResourceInput], {
    nullable: true
  })
  updateMany?: Resource_priceUpdateManyWithWhereWithoutResourceInput[] | undefined;

  @TypeGraphQL.Field(_type => [Resource_priceScalarWhereInput], {
    nullable: true
  })
  deleteMany?: Resource_priceScalarWhereInput[] | undefined;
}
