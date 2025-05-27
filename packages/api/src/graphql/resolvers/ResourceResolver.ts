import { Resolver, Query, Arg } from 'type-graphql';
import dataSource from '../../db';
import { Resource } from '../../models/Resource';
import { ResourceType } from '../types';
import { mapResourceToType } from './mappers';
import { ResourcePrice } from '../../models/ResourcePrice';
import { ResourcePriceType } from '../types';

@Resolver(() => ResourceType)
export class ResourceResolver {
  @Query(() => [ResourceType])
  async resources(): Promise<ResourceType[]> {
    try {
      const resources = await dataSource.getRepository(Resource).find({
        relations: [
          'marketGroups',
          'marketGroups.markets',
          'marketGroups.category',
          'category',
        ],
      });
      return resources.map(mapResourceToType);
    } catch (error) {
      console.error('Error fetching resources:', error);
      throw new Error('Failed to fetch resources');
    }
  }

  @Query(() => ResourceType, { nullable: true })
  async resource(
    @Arg('slug', () => String) slug: string
  ): Promise<ResourceType | null> {
    try {
      const resource = await dataSource.getRepository(Resource).findOne({
        where: { slug },
        relations: ['marketGroups', 'marketGroups.category', 'category'],
      });

      if (!resource) return null;

      return mapResourceToType(resource);
    } catch (error) {
      console.error('Error fetching resource:', error);
      throw new Error('Failed to fetch resource');
    }
  }

  @Query(() => [ResourcePriceType])
  async resourcePrices(): Promise<ResourcePriceType[]> {
    try {
      const prices = await dataSource.getRepository(ResourcePrice).find({
        relations: ['resource'],
      });

      return prices.map((price) => ({
        ...price,
        resource: mapResourceToType(price.resource),
      }));
    } catch (error) {
      console.error('Error fetching resource prices:', error);
      throw new Error('Failed to fetch resource prices');
    }
  }
}
