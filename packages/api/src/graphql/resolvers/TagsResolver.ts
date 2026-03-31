import { Query, Resolver, Ctx, Directive } from 'type-graphql';
import { getPrismaFromContext } from '@generated/type-graphql/helpers';
import type { ApolloContext } from '../startApolloServer';

/**
 * Resolver for fetching popular tags across public conditions.
 * Returns the top 20 most-used tags, excluding internal/meta tags.
 */
@Resolver()
export class TagsResolver {
  @Query(() => [String], {
    nullable: false,
    description: 'Top 20 most-used tags across public conditions',
  })
  @Directive('@cacheControl(maxAge: 300)')
  async popularTags(@Ctx() ctx: ApolloContext): Promise<string[]> {
    const prisma = getPrismaFromContext(ctx);

    const result = await prisma.$queryRaw<{ tag: string }[]>`
      SELECT t AS tag, COUNT(*) AS cnt
      FROM condition, unnest(tags) AS t
      WHERE public = true
        AND array_length(tags, 1) > 0
        AND t NOT LIKE 'Rewards%'
        AND t NOT LIKE 'Finance Rewards%'
        AND t NOT IN (
          'Hide From New', 'Recurring', 'Weekly', 'Monthly',
          'Monthly Hit', 'Multi Strikes', 'Neg Risk', 'Hit Price',
          'Daily Temperature', 'Precipitation', 'Neg Risk',
          'Tweet Markets', 'Crypto Prices', 'Games'
        )
      GROUP BY t
      ORDER BY cnt DESC
      LIMIT 20
    `;

    return result.map((r: { tag: string }) => r.tag);
  }
}
