import { Resolver, Query, Arg } from 'type-graphql';
import dataSource from '../../db';
import { Category } from '../../models/Category';
import { CategoryType } from '../types';
import { MarketGroupType } from '../types';
import { mapMarketGroupToType } from './mappers';

@Resolver(() => CategoryType)
export class CategoryResolver {
  @Query(() => [CategoryType])
  async categories(): Promise<CategoryType[]> {
    try {
      const categories = await dataSource.getRepository(Category).find({
        relations: ['marketGroups', 'marketGroups.markets', 'marketGroups.resource'],
      });
      return categories.map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        marketGroups: category.marketGroups?.map(mapMarketGroupToType) || [],
      }));
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
      const category = await dataSource.getRepository(Category).findOne({
        where: { slug },
        relations: [
          'marketGroups',
          'marketGroups.markets',
          'marketGroups.resource',
        ],
      });

      if (!category) {
        throw new Error(`Category with slug ${slug} not found`);
      }

      return category.marketGroups.map(mapMarketGroupToType);
    } catch (error) {
      console.error('Error fetching markets by category:', error);
      throw new Error('Failed to fetch markets by category');
    }
  }
}
