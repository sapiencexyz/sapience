import { Resolver, Query, Arg } from 'type-graphql';
import prisma from '../../db';
import { Resource, ResourcePrice } from '../types/PrismaTypes';
import type {
  resource,
  resource_price,
  market_group,
  category,
  Prisma,
} from '../../../generated/prisma';

@Resolver(() => Resource)
export class ResourceResolver {
  @Query(() => [Resource])
  async resources(
    @Arg('categorySlug', () => String, { nullable: true }) categorySlug?: string
  ): Promise<Resource[]> {
    try {
      const whereConditions: Prisma.resourceWhereInput = {};

      if (categorySlug) {
        whereConditions.category = {
          slug: categorySlug,
        };
      }

      const resources = await prisma.resource.findMany({
        where: whereConditions,
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
      return resources as Resource[];
    } catch (error) {
      console.error('Error fetching resources:', error);
      throw new Error('Failed to fetch resources');
    }
  }

  @Query(() => Resource, { nullable: true })
  async resource(
    @Arg('slug', () => String) slug: string
  ): Promise<Resource | null> {
    try {
      const resource:
        | (resource & {
            market_group: (market_group & { category: category | null })[];
            category: category | null;
          })
        | null = await prisma.resource.findFirst({
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

      return resource as Resource;
    } catch (error) {
      console.error('Error fetching resource:', error);
      throw new Error('Failed to fetch resource');
    }
  }

  @Query(() => [ResourcePrice])
  async resourcePrices(): Promise<ResourcePrice[]> {
    try {
      const prices: (resource_price & { resource: resource | null })[] =
        await prisma.resource_price.findMany({
          include: {
            resource: true,
          },
        });

      return prices.map(
        (price: resource_price & { resource: resource | null }) => ({
          id: price.id,
          timestamp: price.timestamp,
          value: price.value.toString(),
          blockNumber: price.blockNumber,
          resource: price.resource ? (price.resource as Resource) : null,
        })
      ) as ResourcePrice[];
    } catch (error) {
      console.error('Error fetching resource prices:', error);
      throw new Error('Failed to fetch resource prices');
    }
  }
}
