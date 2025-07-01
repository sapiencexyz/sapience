import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Collateral_transferCreateOrConnectWithoutTransactionInput } from "../inputs/Collateral_transferCreateOrConnectWithoutTransactionInput";
import { Collateral_transferCreateWithoutTransactionInput } from "../inputs/Collateral_transferCreateWithoutTransactionInput";
import { Collateral_transferUpdateToOneWithWhereWithoutTransactionInput } from "../inputs/Collateral_transferUpdateToOneWithWhereWithoutTransactionInput";
import { Collateral_transferUpsertWithoutTransactionInput } from "../inputs/Collateral_transferUpsertWithoutTransactionInput";
import { Collateral_transferWhereInput } from "../inputs/Collateral_transferWhereInput";
import { Collateral_transferWhereUniqueInput } from "../inputs/Collateral_transferWhereUniqueInput";

@TypeGraphQL.InputType("Collateral_transferUpdateOneWithoutTransactionNestedInput", {})
export class Collateral_transferUpdateOneWithoutTransactionNestedInput {
  @TypeGraphQL.Field(_type => Collateral_transferCreateWithoutTransactionInput, {
    nullable: true
  })
  create?: Collateral_transferCreateWithoutTransactionInput | undefined;

  @TypeGraphQL.Field(_type => Collateral_transferCreateOrConnectWithoutTransactionInput, {
    nullable: true
  })
  connectOrCreate?: Collateral_transferCreateOrConnectWithoutTransactionInput | undefined;

  @TypeGraphQL.Field(_type => Collateral_transferUpsertWithoutTransactionInput, {
    nullable: true
  })
  upsert?: Collateral_transferUpsertWithoutTransactionInput | undefined;

  @TypeGraphQL.Field(_type => Collateral_transferWhereInput, {
    nullable: true
  })
  disconnect?: Collateral_transferWhereInput | undefined;

  @TypeGraphQL.Field(_type => Collateral_transferWhereInput, {
    nullable: true
  })
  delete?: Collateral_transferWhereInput | undefined;

  @TypeGraphQL.Field(_type => Collateral_transferWhereUniqueInput, {
    nullable: true
  })
  connect?: Collateral_transferWhereUniqueInput | undefined;

  @TypeGraphQL.Field(_type => Collateral_transferUpdateToOneWithWhereWithoutTransactionInput, {
    nullable: true
  })
  update?: Collateral_transferUpdateToOneWithWhereWithoutTransactionInput | undefined;
}
