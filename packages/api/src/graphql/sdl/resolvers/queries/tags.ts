/**
 * Query.popularTags — top 20 most-used tags across public conditions,
 * excluding a hard-coded deny list of internal/meta tags that flow in
 * from Polymarket metadata.
 */

import type { QueryResolvers } from '../../__generated__/resolvers';
import prisma from '../../../../db';

export const popularTags: NonNullable<
  QueryResolvers['popularTags']
> = async () => {
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
          'Daily Temperature', 'Precipitation',
          'Tweet Markets', 'Crypto Prices', 'Games'
        )
      GROUP BY t
      ORDER BY cnt DESC
      LIMIT 20
    `;
  return result.map((r) => r.tag);
};
