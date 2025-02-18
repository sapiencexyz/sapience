import { RESOURCES } from 'src/fixtures';
import { Resource } from 'src/models/Resource';

export const reindexResource = async (
  resource: Resource,
  startTimestamp: number
) => {
  const indexer = RESOURCES.find((element) => {
    return element.slug === resource.slug;
  })?.priceIndexer;

  await indexer?.indexBlockPriceFromTimestamp(resource, startTimestamp);
  return;
};
