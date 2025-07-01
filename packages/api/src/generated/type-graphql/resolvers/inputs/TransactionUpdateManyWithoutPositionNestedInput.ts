import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { TransactionCreateManyPositionInputEnvelope } from "../inputs/TransactionCreateManyPositionInputEnvelope";
import { TransactionCreateOrConnectWithoutPositionInput } from "../inputs/TransactionCreateOrConnectWithoutPositionInput";
import { TransactionCreateWithoutPositionInput } from "../inputs/TransactionCreateWithoutPositionInput";
import { TransactionScalarWhereInput } from "../inputs/TransactionScalarWhereInput";
import { TransactionUpdateManyWithWhereWithoutPositionInput } from "../inputs/TransactionUpdateManyWithWhereWithoutPositionInput";
import { TransactionUpdateWithWhereUniqueWithoutPositionInput } from "../inputs/TransactionUpdateWithWhereUniqueWithoutPositionInput";
import { TransactionUpsertWithWhereUniqueWithoutPositionInput } from "../inputs/TransactionUpsertWithWhereUniqueWithoutPositionInput";
import { TransactionWhereUniqueInput } from "../inputs/TransactionWhereUniqueInput";

@TypeGraphQL.InputType("TransactionUpdateManyWithoutPositionNestedInput", {})
export class TransactionUpdateManyWithoutPositionNestedInput {
  @TypeGraphQL.Field(_type => [TransactionCreateWithoutPositionInput], {
    nullable: true
  })
  create?: TransactionCreateWithoutPositionInput[] | undefined;

  @TypeGraphQL.Field(_type => [TransactionCreateOrConnectWithoutPositionInput], {
    nullable: true
  })
  connectOrCreate?: TransactionCreateOrConnectWithoutPositionInput[] | undefined;

  @TypeGraphQL.Field(_type => [TransactionUpsertWithWhereUniqueWithoutPositionInput], {
    nullable: true
  })
  upsert?: TransactionUpsertWithWhereUniqueWithoutPositionInput[] | undefined;

  @TypeGraphQL.Field(_type => TransactionCreateManyPositionInputEnvelope, {
    nullable: true
  })
  createMany?: TransactionCreateManyPositionInputEnvelope | undefined;

  @TypeGraphQL.Field(_type => [TransactionWhereUniqueInput], {
    nullable: true
  })
  set?: TransactionWhereUniqueInput[] | undefined;

  @TypeGraphQL.Field(_type => [TransactionWhereUniqueInput], {
    nullable: true
  })
  disconnect?: TransactionWhereUniqueInput[] | undefined;

  @TypeGraphQL.Field(_type => [TransactionWhereUniqueInput], {
    nullable: true
  })
  delete?: TransactionWhereUniqueInput[] | undefined;

  @TypeGraphQL.Field(_type => [TransactionWhereUniqueInput], {
    nullable: true
  })
  connect?: TransactionWhereUniqueInput[] | undefined;

  @TypeGraphQL.Field(_type => [TransactionUpdateWithWhereUniqueWithoutPositionInput], {
    nullable: true
  })
  update?: TransactionUpdateWithWhereUniqueWithoutPositionInput[] | undefined;

  @TypeGraphQL.Field(_type => [TransactionUpdateManyWithWhereWithoutPositionInput], {
    nullable: true
  })
  updateMany?: TransactionUpdateManyWithWhereWithoutPositionInput[] | undefined;

  @TypeGraphQL.Field(_type => [TransactionScalarWhereInput], {
    nullable: true
  })
  deleteMany?: TransactionScalarWhereInput[] | undefined;
}
