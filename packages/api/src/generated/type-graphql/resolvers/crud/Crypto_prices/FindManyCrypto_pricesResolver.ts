import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { FindManyCrypto_pricesArgs } from "./args/FindManyCrypto_pricesArgs";
import { Crypto_prices } from "../../../models/Crypto_prices";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Crypto_prices)
export class FindManyCrypto_pricesResolver {
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
}
