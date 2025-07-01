import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Collateral_transferAvgAggregate } from "../outputs/Collateral_transferAvgAggregate";
import { Collateral_transferCountAggregate } from "../outputs/Collateral_transferCountAggregate";
import { Collateral_transferMaxAggregate } from "../outputs/Collateral_transferMaxAggregate";
import { Collateral_transferMinAggregate } from "../outputs/Collateral_transferMinAggregate";
import { Collateral_transferSumAggregate } from "../outputs/Collateral_transferSumAggregate";

@TypeGraphQL.ObjectType("AggregateCollateral_transfer", {})
export class AggregateCollateral_transfer {
  @TypeGraphQL.Field(_type => Collateral_transferCountAggregate, {
    nullable: true
  })
  _count!: Collateral_transferCountAggregate | null;

  @TypeGraphQL.Field(_type => Collateral_transferAvgAggregate, {
    nullable: true
  })
  _avg!: Collateral_transferAvgAggregate | null;

  @TypeGraphQL.Field(_type => Collateral_transferSumAggregate, {
    nullable: true
  })
  _sum!: Collateral_transferSumAggregate | null;

  @TypeGraphQL.Field(_type => Collateral_transferMinAggregate, {
    nullable: true
  })
  _min!: Collateral_transferMinAggregate | null;

  @TypeGraphQL.Field(_type => Collateral_transferMaxAggregate, {
    nullable: true
  })
  _max!: Collateral_transferMaxAggregate | null;
}
