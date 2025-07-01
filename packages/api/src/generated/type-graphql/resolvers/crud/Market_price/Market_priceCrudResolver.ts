import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { AggregateMarket_priceArgs } from "./args/AggregateMarket_priceArgs";
import { CreateManyAndReturnMarket_priceArgs } from "./args/CreateManyAndReturnMarket_priceArgs";
import { CreateManyMarket_priceArgs } from "./args/CreateManyMarket_priceArgs";
import { CreateOneMarket_priceArgs } from "./args/CreateOneMarket_priceArgs";
import { DeleteManyMarket_priceArgs } from "./args/DeleteManyMarket_priceArgs";
import { DeleteOneMarket_priceArgs } from "./args/DeleteOneMarket_priceArgs";
import { FindFirstMarket_priceArgs } from "./args/FindFirstMarket_priceArgs";
import { FindFirstMarket_priceOrThrowArgs } from "./args/FindFirstMarket_priceOrThrowArgs";
import { FindManyMarket_priceArgs } from "./args/FindManyMarket_priceArgs";
import { FindUniqueMarket_priceArgs } from "./args/FindUniqueMarket_priceArgs";
import { FindUniqueMarket_priceOrThrowArgs } from "./args/FindUniqueMarket_priceOrThrowArgs";
import { GroupByMarket_priceArgs } from "./args/GroupByMarket_priceArgs";
import { UpdateManyMarket_priceArgs } from "./args/UpdateManyMarket_priceArgs";
import { UpdateOneMarket_priceArgs } from "./args/UpdateOneMarket_priceArgs";
import { UpsertOneMarket_priceArgs } from "./args/UpsertOneMarket_priceArgs";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";
import { Market_price } from "../../../models/Market_price";
import { AffectedRowsOutput } from "../../outputs/AffectedRowsOutput";
import { AggregateMarket_price } from "../../outputs/AggregateMarket_price";
import { CreateManyAndReturnMarket_price } from "../../outputs/CreateManyAndReturnMarket_price";
import { Market_priceGroupBy } from "../../outputs/Market_priceGroupBy";

@TypeGraphQL.Resolver(_of => Market_price)
export class Market_priceCrudResolver {
  @TypeGraphQL.Query(_returns => AggregateMarket_price, {
    nullable: false
  })
  async aggregateMarket_price(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: AggregateMarket_priceArgs): Promise<AggregateMarket_price> {
    return getPrismaFromContext(ctx).market_price.aggregate({
      ...args,
      ...transformInfoIntoPrismaArgs(info),
    });
  }

  @TypeGraphQL.Mutation(_returns => AffectedRowsOutput, {
    nullable: false
  })
  async createManyMarket_price(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: CreateManyMarket_priceArgs): Promise<AffectedRowsOutput> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).market_price.createMany({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.Mutation(_returns => [CreateManyAndReturnMarket_price], {
    nullable: false
  })
  async createManyAndReturnMarket_price(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: CreateManyAndReturnMarket_priceArgs): Promise<CreateManyAndReturnMarket_price[]> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).market_price.createManyAndReturn({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.Mutation(_returns => Market_price, {
    nullable: false
  })
  async createOneMarket_price(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: CreateOneMarket_priceArgs): Promise<Market_price> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).market_price.create({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.Mutation(_returns => AffectedRowsOutput, {
    nullable: false
  })
  async deleteManyMarket_price(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: DeleteManyMarket_priceArgs): Promise<AffectedRowsOutput> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).market_price.deleteMany({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.Mutation(_returns => Market_price, {
    nullable: true
  })
  async deleteOneMarket_price(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: DeleteOneMarket_priceArgs): Promise<Market_price | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).market_price.delete({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.Query(_returns => Market_price, {
    nullable: true
  })
  async findFirstMarket_price(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: FindFirstMarket_priceArgs): Promise<Market_price | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).market_price.findFirst({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.Query(_returns => Market_price, {
    nullable: true
  })
  async findFirstMarket_priceOrThrow(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: FindFirstMarket_priceOrThrowArgs): Promise<Market_price | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).market_price.findFirstOrThrow({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.Query(_returns => [Market_price], {
    nullable: false
  })
  async market_prices(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: FindManyMarket_priceArgs): Promise<Market_price[]> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).market_price.findMany({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.Query(_returns => Market_price, {
    nullable: true
  })
  async market_price(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: FindUniqueMarket_priceArgs): Promise<Market_price | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).market_price.findUnique({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.Query(_returns => Market_price, {
    nullable: true
  })
  async getMarket_price(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: FindUniqueMarket_priceOrThrowArgs): Promise<Market_price | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).market_price.findUniqueOrThrow({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.Query(_returns => [Market_priceGroupBy], {
    nullable: false
  })
  async groupByMarket_price(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: GroupByMarket_priceArgs): Promise<Market_priceGroupBy[]> {
    const { _count, _avg, _sum, _min, _max } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).market_price.groupBy({
      ...args,
      ...Object.fromEntries(
        Object.entries({ _count, _avg, _sum, _min, _max }).filter(([_, v]) => v != null)
      ),
    });
  }

  @TypeGraphQL.Mutation(_returns => AffectedRowsOutput, {
    nullable: false
  })
  async updateManyMarket_price(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: UpdateManyMarket_priceArgs): Promise<AffectedRowsOutput> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).market_price.updateMany({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.Mutation(_returns => Market_price, {
    nullable: true
  })
  async updateOneMarket_price(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: UpdateOneMarket_priceArgs): Promise<Market_price | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).market_price.update({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.Mutation(_returns => Market_price, {
    nullable: false
  })
  async upsertOneMarket_price(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: UpsertOneMarket_priceArgs): Promise<Market_price> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).market_price.upsert({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
