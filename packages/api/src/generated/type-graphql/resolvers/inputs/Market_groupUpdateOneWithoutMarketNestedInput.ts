import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_groupCreateOrConnectWithoutMarketInput } from "../inputs/Market_groupCreateOrConnectWithoutMarketInput";
import { Market_groupCreateWithoutMarketInput } from "../inputs/Market_groupCreateWithoutMarketInput";
import { Market_groupUpdateToOneWithWhereWithoutMarketInput } from "../inputs/Market_groupUpdateToOneWithWhereWithoutMarketInput";
import { Market_groupUpsertWithoutMarketInput } from "../inputs/Market_groupUpsertWithoutMarketInput";
import { Market_groupWhereInput } from "../inputs/Market_groupWhereInput";
import { Market_groupWhereUniqueInput } from "../inputs/Market_groupWhereUniqueInput";

@TypeGraphQL.InputType("Market_groupUpdateOneWithoutMarketNestedInput", {})
export class Market_groupUpdateOneWithoutMarketNestedInput {
  @TypeGraphQL.Field(_type => Market_groupCreateWithoutMarketInput, {
    nullable: true
  })
  create?: Market_groupCreateWithoutMarketInput | undefined;

  @TypeGraphQL.Field(_type => Market_groupCreateOrConnectWithoutMarketInput, {
    nullable: true
  })
  connectOrCreate?: Market_groupCreateOrConnectWithoutMarketInput | undefined;

  @TypeGraphQL.Field(_type => Market_groupUpsertWithoutMarketInput, {
    nullable: true
  })
  upsert?: Market_groupUpsertWithoutMarketInput | undefined;

  @TypeGraphQL.Field(_type => Market_groupWhereInput, {
    nullable: true
  })
  disconnect?: Market_groupWhereInput | undefined;

  @TypeGraphQL.Field(_type => Market_groupWhereInput, {
    nullable: true
  })
  delete?: Market_groupWhereInput | undefined;

  @TypeGraphQL.Field(_type => Market_groupWhereUniqueInput, {
    nullable: true
  })
  connect?: Market_groupWhereUniqueInput | undefined;

  @TypeGraphQL.Field(_type => Market_groupUpdateToOneWithWhereWithoutMarketInput, {
    nullable: true
  })
  update?: Market_groupUpdateToOneWithWhereWithoutMarketInput | undefined;
}
