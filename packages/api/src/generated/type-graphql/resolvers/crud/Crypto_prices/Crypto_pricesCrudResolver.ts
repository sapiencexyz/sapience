import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { AggregateCrypto_pricesArgs } from "./args/AggregateCrypto_pricesArgs";
import { CreateManyAndReturnCrypto_pricesArgs } from "./args/CreateManyAndReturnCrypto_pricesArgs";
import { CreateManyCrypto_pricesArgs } from "./args/CreateManyCrypto_pricesArgs";
import { CreateOneCrypto_pricesArgs } from "./args/CreateOneCrypto_pricesArgs";
import { DeleteManyCrypto_pricesArgs } from "./args/DeleteManyCrypto_pricesArgs";
import { DeleteOneCrypto_pricesArgs } from "./args/DeleteOneCrypto_pricesArgs";
import { FindFirstCrypto_pricesArgs } from "./args/FindFirstCrypto_pricesArgs";
import { FindFirstCrypto_pricesOrThrowArgs } from "./args/FindFirstCrypto_pricesOrThrowArgs";
import { FindManyCrypto_pricesArgs } from "./args/FindManyCrypto_pricesArgs";
import { FindUniqueCrypto_pricesArgs } from "./args/FindUniqueCrypto_pricesArgs";
import { FindUniqueCrypto_pricesOrThrowArgs } from "./args/FindUniqueCrypto_pricesOrThrowArgs";
import { GroupByCrypto_pricesArgs } from "./args/GroupByCrypto_pricesArgs";
import { UpdateManyCrypto_pricesArgs } from "./args/UpdateManyCrypto_pricesArgs";
import { UpdateOneCrypto_pricesArgs } from "./args/UpdateOneCrypto_pricesArgs";
import { UpsertOneCrypto_pricesArgs } from "./args/UpsertOneCrypto_pricesArgs";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";
import { Crypto_prices } from "../../../models/Crypto_prices";
import { AffectedRowsOutput } from "../../outputs/AffectedRowsOutput";
import { AggregateCrypto_prices } from "../../outputs/AggregateCrypto_prices";
import { CreateManyAndReturnCrypto_prices } from "../../outputs/CreateManyAndReturnCrypto_prices";
import { Crypto_pricesGroupBy } from "../../outputs/Crypto_pricesGroupBy";

@TypeGraphQL.Resolver(_of => Crypto_prices)
export class Crypto_pricesCrudResolver {
  @TypeGraphQL.Query(_returns => AggregateCrypto_prices, {
    nullable: false
  })
  async aggregateCrypto_prices(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: AggregateCrypto_pricesArgs): Promise<AggregateCrypto_prices> {
    return getPrismaFromContext(ctx).crypto_prices.aggregate({
      ...args,
      ...transformInfoIntoPrismaArgs(info),
    });
  }

  @TypeGraphQL.Mutation(_returns => AffectedRowsOutput, {
    nullable: false
  })
  async createManyCrypto_prices(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: CreateManyCrypto_pricesArgs): Promise<AffectedRowsOutput> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).crypto_prices.createMany({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.Mutation(_returns => [CreateManyAndReturnCrypto_prices], {
    nullable: false
  })
  async createManyAndReturnCrypto_prices(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: CreateManyAndReturnCrypto_pricesArgs): Promise<CreateManyAndReturnCrypto_prices[]> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).crypto_prices.createManyAndReturn({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.Mutation(_returns => Crypto_prices, {
    nullable: false
  })
  async createOneCrypto_prices(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: CreateOneCrypto_pricesArgs): Promise<Crypto_prices> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).crypto_prices.create({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.Mutation(_returns => AffectedRowsOutput, {
    nullable: false
  })
  async deleteManyCrypto_prices(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: DeleteManyCrypto_pricesArgs): Promise<AffectedRowsOutput> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).crypto_prices.deleteMany({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.Mutation(_returns => Crypto_prices, {
    nullable: true
  })
  async deleteOneCrypto_prices(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: DeleteOneCrypto_pricesArgs): Promise<Crypto_prices | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).crypto_prices.delete({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.Query(_returns => Crypto_prices, {
    nullable: true
  })
  async findFirstCrypto_prices(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: FindFirstCrypto_pricesArgs): Promise<Crypto_prices | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).crypto_prices.findFirst({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.Query(_returns => Crypto_prices, {
    nullable: true
  })
  async findFirstCrypto_pricesOrThrow(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: FindFirstCrypto_pricesOrThrowArgs): Promise<Crypto_prices | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).crypto_prices.findFirstOrThrow({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.Query(_returns => [Crypto_prices], {
    nullable: false
  })
  async findManyCrypto_prices(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: FindManyCrypto_pricesArgs): Promise<Crypto_prices[]> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).crypto_prices.findMany({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.Query(_returns => Crypto_prices, {
    nullable: true
  })
  async findUniqueCrypto_prices(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: FindUniqueCrypto_pricesArgs): Promise<Crypto_prices | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).crypto_prices.findUnique({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.Query(_returns => Crypto_prices, {
    nullable: true
  })
  async findUniqueCrypto_pricesOrThrow(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: FindUniqueCrypto_pricesOrThrowArgs): Promise<Crypto_prices | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).crypto_prices.findUniqueOrThrow({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.Query(_returns => [Crypto_pricesGroupBy], {
    nullable: false
  })
  async groupByCrypto_prices(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: GroupByCrypto_pricesArgs): Promise<Crypto_pricesGroupBy[]> {
    const { _count, _avg, _sum, _min, _max } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).crypto_prices.groupBy({
      ...args,
      ...Object.fromEntries(
        Object.entries({ _count, _avg, _sum, _min, _max }).filter(([_, v]) => v != null)
      ),
    });
  }

  @TypeGraphQL.Mutation(_returns => AffectedRowsOutput, {
    nullable: false
  })
  async updateManyCrypto_prices(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: UpdateManyCrypto_pricesArgs): Promise<AffectedRowsOutput> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).crypto_prices.updateMany({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.Mutation(_returns => Crypto_prices, {
    nullable: true
  })
  async updateOneCrypto_prices(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: UpdateOneCrypto_pricesArgs): Promise<Crypto_prices | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).crypto_prices.update({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.Mutation(_returns => Crypto_prices, {
    nullable: false
  })
  async upsertOneCrypto_prices(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: UpsertOneCrypto_pricesArgs): Promise<Crypto_prices> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).crypto_prices.upsert({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
