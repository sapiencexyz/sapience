import { Resolver, Query, Arg } from 'type-graphql';
import prisma from '../../db';
import { Category, MarketGroup } from '../types/PrismaTypes';

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

  @Query(() => [MarketGroup])
  async marketGroupsByCategory(
    @Arg('slug', () => String) slug: string
  ): Promise<MarketGroup[]> {
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

      return category.market_group as MarketGroup[];
    } catch (error) {
      console.error('Error fetching markets by category:', error);
      throw new Error('Failed to fetch markets by category');
    }
  }
}
