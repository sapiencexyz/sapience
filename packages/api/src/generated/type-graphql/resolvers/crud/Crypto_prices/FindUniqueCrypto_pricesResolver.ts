import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { FindUniqueCrypto_pricesArgs } from "./args/FindUniqueCrypto_pricesArgs";
import { Crypto_prices } from "../../../models/Crypto_prices";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Crypto_prices)
export class FindUniqueCrypto_pricesResolver {
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
}
