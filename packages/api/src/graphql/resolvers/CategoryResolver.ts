import { Resolver, Query, Arg } from 'type-graphql';
import dataSource from '../../db';
import { Category } from '../../models/Category';
import { CategoryType } from '../types';
import { MarketType } from '../types';
import { mapMarketToType } from './mappers';

@Resolver(() => CategoryType)
export class CategoryResolver {
  @Query(() => [CategoryType])
  async categories(): Promise<CategoryType[]> {
    try {
      const categories = await dataSource.getRepository(Category).find({
        relations: ['markets', 'markets.epochs', 'markets.resource'],
      });
      return categories.map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        markets: category.markets.map(mapMarketToType),
      }));
    } catch (error) {
      console.error('Error fetching categories:', error);
      throw new Error('Failed to fetch categories');
    }
  }

  @Query(() => [MarketType])
  async marketsByCategory(
    @Arg('slug', () => String) slug: string
  ): Promise<MarketType[]> {
    try {
      const category = await dataSource.getRepository(Category).findOne({
        where: { slug },
        relations: ['markets', 'markets.epochs', 'markets.resource'],
      });

      if (!category) {
        throw new Error(`Category with slug ${slug} not found`);
      }

      return category.markets.map(mapMarketToType);
    } catch (error) {
      console.error('Error fetching markets by category:', error);
      throw new Error('Failed to fetch markets by category');
    }
  }
} 