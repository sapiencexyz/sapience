import { mainnet } from 'viem/chains';
import prisma from './db';
import fixturesData from './fixtures.json';
import { IResourcePriceIndexer } from './interfaces';
import evmIndexer from './workers/indexers/evmIndexer';
import { WeatherIndexer } from './workers/indexers/weatherIndexer';
import BtcHashIndexer from './workers/indexers/btcHashIndexer';

export const TIME_INTERVALS = {
  intervals: {
    INTERVAL_1_MINUTE: 60,
    INTERVAL_5_MINUTES: 5 * 60,
    INTERVAL_15_MINUTES: 15 * 60,
    INTERVAL_30_MINUTES: 30 * 60,
    INTERVAL_4_HOURS: 4 * 60 * 60,
    INTERVAL_1_DAY: 24 * 60 * 60,
    INTERVAL_7_DAYS: 7 * 24 * 60 * 60,
    INTERVAL_28_DAYS: 28 * 24 * 60 * 60,
  },
};

export const INDEXERS: {
  [key: string]: IResourcePriceIndexer;
} = {
  'ethereum-gas': new evmIndexer(mainnet.id),
  'nyc-air-temperature': new WeatherIndexer('temperature'),
  'sf-precipitation': new WeatherIndexer('precipitation'),
  'bitcoin-hashrate': new BtcHashIndexer(),
};

// Function to initialize fixtures - upsert resources and markets from fixtures.json
export const initializeFixtures = async (): Promise<void> => {
  console.log('Initializing fixtures from fixtures.json');

  for (const categoryData of fixturesData.CATEGORIES) {
    let category = await prisma.category.findFirst({
      where: { slug: categoryData.slug },
    });

    if (!category) {
      category = await prisma.category.create({
        data: {
          name: categoryData.name,
          slug: categoryData.slug,
        },
      });
      console.log('Created category:', categoryData.name);
    }
  }

  for (const resourceData of fixturesData.RESOURCES) {
    try {
      let resource = await prisma.resource.findFirst({
        where: { name: resourceData.name },
      });

      const category = await prisma.category.findFirst({
        where: { slug: resourceData.category },
      });

      if (!category) {
        console.error(
          `Category not found for resource ${resourceData.name}: ${resourceData.category}`
        );
        continue;
      }

      if (!resource) {
        resource = await prisma.resource.create({
          data: {
            name: resourceData.name,
            slug: resourceData.slug,
            categoryId: category.id,
          },
        });
        console.log('Created resource:', resourceData.name);
      } else {
        let updated = false;
        const updateData: any = {};

        if (resource.slug !== resourceData.slug) {
          updateData.slug = resourceData.slug;
          updated = true;
        }

        if (resource.categoryId !== category.id) {
          updateData.categoryId = category.id;
          updated = true;
        }

        if (updated) {
          await prisma.resource.update({
            where: { id: resource.id },
            data: updateData,
          });
          console.log('Updated resource:', resourceData.name);
        }
      }
    } catch (error) {
      console.error(
        `Error creating/updating resource ${resourceData.name}:`,
        error
      );
    }
  }
};
