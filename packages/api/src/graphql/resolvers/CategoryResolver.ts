import { Resolver, Query, Arg } from 'type-graphql';
import prisma from '../../db';
import { Category, Market_group } from '@generated/type-graphql';

@Resolver(() => Category)
export class CategoryResolver {
  @Query(() => [Category])
  async categories(): Promise<Category[]> {
    try {
      const categories = await prisma.category.findMany({
        include: {
          market_group: {
            include: {
              market: true,
              resource: true,
            },
          },
        },
      });
      return categories as Category[];
    } catch (error) {
      console.error('Error fetching categories:', error);
      throw new Error('Failed to fetch categories');
    }
  }

  @Query(() => [Market_group])
  async marketGroupsByCategory(
    @Arg('slug', () => String) slug: string
  ): Promise<Market_group[]> {
    try {
      const category = await prisma.category.findFirst({
        where: { slug },
        include: {
          market_group: {
            include: {
              market: true,
              resource: true,
            },
          },
        },
      });

      if (!category) {
        throw new Error(`Category with slug ${slug} not found`);
      }

      return category.market_group as Market_group[];
    } catch (error) {
      console.error('Error fetching markets by category:', error);
      throw new Error('Failed to fetch markets by category');
    }
  }
}
