import { Resolver, Query, Arg } from 'type-graphql';
import dataSource from '../../db';
import { Resource } from '../../models/Resource';
import { ResourceType } from '../types';
import { mapResourceToType } from './mappers';

@Resolver(() => ResourceType)
export class ResourceResolver {
  @Query(() => [ResourceType])
  async resources(): Promise<ResourceType[]> {
    try {
      const resources = await dataSource.getRepository(Resource).find({
        relations: ['markets'],
      });
      const mappedResources = resources.map(mapResourceToType);
      return mappedResources;
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
        relations: ['markets', 'markets.epochs', 'resourcePrices'],
      });

      if (!resource) return null;

      return mapResourceToType(resource);
    } catch (error) {
      console.error('Error fetching resource:', error);
      throw new Error('Failed to fetch resource');
    }
  }
}
