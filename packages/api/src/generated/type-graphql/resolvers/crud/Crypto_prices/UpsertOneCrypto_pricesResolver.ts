import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { UpsertOneCrypto_pricesArgs } from "./args/UpsertOneCrypto_pricesArgs";
import { Crypto_prices } from "../../../models/Crypto_prices";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Crypto_prices)
export class UpsertOneCrypto_pricesResolver {
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
