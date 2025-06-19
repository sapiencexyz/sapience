import { Resolver, Query, Arg } from 'type-graphql';
import prisma from '../../db';
import { CategoryType } from '../types';
import { MarketGroupType } from '../types';
import { mapCategoryToType, mapMarketGroupToType } from './mappers';

@Resolver(() => CategoryType)
export class CategoryResolver {
  @Query(() => [CategoryType])
  async categories(): Promise<CategoryType[]> {
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
      return categories.map((category) => mapCategoryToType(category as any));
    } catch (error) {
      console.error('Error fetching categories:', error);
      throw new Error('Failed to fetch categories');
    }
  }

  @Query(() => [MarketGroupType])
  async marketGroupsByCategory(
    @Arg('slug', () => String) slug: string
  ): Promise<MarketGroupType[]> {
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

      return category.market_group.map((marketGroup) => mapMarketGroupToType(marketGroup as any));
    } catch (error) {
      console.error('Error fetching markets by category:', error);
      throw new Error('Failed to fetch markets by category');
    }
  }
}
