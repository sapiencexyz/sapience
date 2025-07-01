import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { GroupByCrypto_pricesArgs } from "./args/GroupByCrypto_pricesArgs";
import { Crypto_prices } from "../../../models/Crypto_prices";
import { Crypto_pricesGroupBy } from "../../outputs/Crypto_pricesGroupBy";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Crypto_prices)
export class GroupByCrypto_pricesResolver {
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
}
