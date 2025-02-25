import { RESOURCES } from 'src/fixtures';
import { Resource } from 'src/models/Resource';

export const reindexResource = async (
  resource: Resource,
  startTimestamp: number,
  endTimestamp?: number
) => {
  const indexer = RESOURCES.find((element) => {
    return element.slug === resource.slug;
  })?.priceIndexer;

  const result = await indexer?.indexBlockPriceFromTimestamp(
    resource,
    startTimestamp,
    endTimestamp
  );
  return result;
};
