import { mainnet } from 'viem/chains';
import { categoryRepository, resourceRepository } from './db';
import fixturesData from './fixtures.json';
import { IResourcePriceIndexer } from './interfaces';
import { Category } from './models/Category';
import { Resource } from './models/Resource';
import evmIndexer from './indexers/evmIndexer';
import { WeatherIndexer } from './indexers/weatherIndexer';

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
};

// Function to initialize fixtures - upsert resources and markets from fixtures.json
export const initializeFixtures = async (): Promise<void> => {
  console.log('Initializing fixtures from fixtures.json');

  for (const categoryData of fixturesData.CATEGORIES) {
    let category = await categoryRepository.findOne({
      where: { slug: categoryData.slug },
    });

    if (!category) {
      category = new Category();
      category.name = categoryData.name;
      category.slug = categoryData.slug;
      await categoryRepository.save(category);
      console.log('Created category:', categoryData.name);
    }
  }

  for (const resourceData of fixturesData.RESOURCES) {
    try {
      let resource = await resourceRepository.findOne({
        where: { name: resourceData.name },
      });

      const category = await categoryRepository.findOne({
        where: { slug: resourceData.category },
      });

      if (!category) {
        console.error(
          `Category not found for resource ${resourceData.name}: ${resourceData.category}`
        );
        continue;
      }

      if (!resource) {
        resource = new Resource();
        resource.name = resourceData.name;
        resource.slug = resourceData.slug;
        resource.category = category;
        await resourceRepository.save(resource);
        console.log('Created resource:', resourceData.name);
      } else {
        let updated = false;
        if (resource.slug !== resourceData.slug) {
          resource.slug = resourceData.slug;
          updated = true;
        }

        if (!resource.category || resource.category.id !== category.id) {
          const currentResource = await resourceRepository.findOne({
            where: { id: resource.id },
            relations: ['category'],
          });
          if (
            currentResource &&
            (!currentResource.category ||
              currentResource.category.id !== category.id)
          ) {
            resource.category = category;
            updated = true;
          } else if (!currentResource) {
            console.log(`Resource ${resource.name} not found for update.`);
            continue;
          }
        }

        if (updated) {
          await resourceRepository.save(resource);
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
