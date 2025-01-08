import { Between, LessThanOrEqual, MoreThanOrEqual } from "typeorm";
import { ResourcePrice } from "../models/ResourcePrice";
import { IndexPrice } from "../models/IndexPrice";
import {
  epochRepository,
  indexPriceRepository,
  marketRepository,
  resourcePriceRepository,
} from "src/db";

export const upsertIndexPriceFromResourcePrice = async (
  resourcePrice: ResourcePrice
) => {
  // Get the market associated with the resource price's resource
  const market = await marketRepository.findOne({
    where: { resource: { id: resourcePrice.resource.id } },
  });
  if (!market) {
    throw new Error(`Market not found for resource price ${resourcePrice.id}`);
  }

  // Find all epochs associated with that market that have a startTime before or including the timestamp of the resource price and an endTime after or including the timestamp of the resource price
  const relevantEpochs = await epochRepository.find({
    where: {
      market: { id: market.id },
      startTimestamp: LessThanOrEqual(resourcePrice.timestamp),
      endTimestamp: MoreThanOrEqual(resourcePrice.timestamp),
    },
  });

  // For each of these epochs
  for (const epoch of relevantEpochs) {
    // Get all resource prices for the resource that are within the bounds of the epoch
    const resourcePrices = await resourcePriceRepository.find({
      where: {
        resource: { id: resourcePrice.resource.id },
        timestamp: Between(epoch.startTimestamp!, resourcePrice.timestamp!),
      },
      order: { timestamp: "ASC" },
    });

    const totalGasUsed: number = resourcePrices.reduce(
      (total, price) => total + Number(price.used),
      0
    );

    const totalBaseFeesPaid: number = resourcePrices.reduce(
      (total, price) => total + Number(price.feePaid),
      0
    );

    const averagePrice: number = totalBaseFeesPaid / totalGasUsed;

    // Create or update the index price associated with the epoch
    let indexPrice = await indexPriceRepository.findOne({
      where: { epoch: { id: epoch.id }, timestamp: resourcePrice.timestamp },
    });

    if (!indexPrice) {
      indexPrice = new IndexPrice();
      indexPrice.epoch = epoch;
      indexPrice.timestamp = resourcePrice.timestamp;
    }

    indexPrice.value = averagePrice.toString();

    await indexPriceRepository.save(indexPrice);
  }
};
