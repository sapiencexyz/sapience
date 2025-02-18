import { resourceRepository } from 'src/db';
import { RESOURCES } from 'src/fixtures';
import { Resource } from 'src/models/Resource';

export const reindexResource = async (slug: string, startTimestamp: number) => {
  const indexer = RESOURCES.find((element) => {
    return element.slug === slug;
  })?.priceIndexer;

  const resource: Resource | null = await resourceRepository.findOne({
    where: {
      slug: slug,
    },
  });

  if (!resource) {
    throw new Error('Resource for the chosen slug was not found');
  }

  await indexer?.indexBlockPriceFromTimestamp(resource, startTimestamp);
  return;
};
