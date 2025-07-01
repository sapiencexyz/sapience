import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { EventOrderByWithRelationInput } from "../../../inputs/EventOrderByWithRelationInput";
import { EventWhereInput } from "../../../inputs/EventWhereInput";
import { EventWhereUniqueInput } from "../../../inputs/EventWhereUniqueInput";
import { EventScalarFieldEnum } from "../../../../enums/EventScalarFieldEnum";

@TypeGraphQL.ArgsType()
export class FindFirstEventOrThrowArgs {
  @TypeGraphQL.Field(_type => EventWhereInput, {
    nullable: true
  })
  where?: EventWhereInput | undefined;

  @TypeGraphQL.Field(_type => [EventOrderByWithRelationInput], {
    nullable: true
  })
  orderBy?: EventOrderByWithRelationInput[] | undefined;

  @TypeGraphQL.Field(_type => EventWhereUniqueInput, {
    nullable: true
  })
  cursor?: EventWhereUniqueInput | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  take?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  skip?: number | undefined;

  @TypeGraphQL.Field(_type => [EventScalarFieldEnum], {
    nullable: true
  })
  distinct?: Array<"id" | "createdAt" | "blockNumber" | "transactionHash" | "timestamp" | "logIndex" | "logData" | "marketGroupId"> | undefined;
}
