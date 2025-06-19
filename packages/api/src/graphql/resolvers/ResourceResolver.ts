import { Resolver, Query, Arg } from 'type-graphql';
import prisma from '../../db';
import { ResourceType } from '../types';
import { mapResourceToType } from './mappers';
import { ResourcePriceType } from '../types';

@Resolver(() => ResourceType)
export class ResourceResolver {
  @Query(() => [ResourceType])
  async resources(): Promise<ResourceType[]> {
    try {
      const resources = await prisma.resource.findMany({
        include: {
          market_group: {
            include: {
              market: true,
              category: true,
            },
          },
          category: true,
        },
      });
      return resources.map(mapResourceToType as any);
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
      const resource = await prisma.resource.findFirst({
        where: { slug },
        include: {
          market_group: {
            include: {
              category: true,
            },
          },
          category: true,
        },
      });

      if (!resource) return null;

      return mapResourceToType(resource as any);
    } catch (error) {
      console.error('Error fetching resource:', error);
      throw new Error('Failed to fetch resource');
    }
  }

  @Query(() => [ResourcePriceType])
  async resourcePrices(): Promise<ResourcePriceType[]> {
    try {
      const prices = await prisma.resource_price.findMany({
        include: {
          resource: true,
        },
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
