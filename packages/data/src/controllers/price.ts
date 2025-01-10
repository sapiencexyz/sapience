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
  const markets = await marketRepository.find({
    where: { resource: { id: resourcePrice.resource.id } },
  });
  if (markets.length === 0) {
    console.log(
      `Market not found for resource price ${resourcePrice.id} ${resourcePrice.resource.name}`
    );
    return;
  }
  for (const market of markets) {
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

      const totalGasUsed: bigint = resourcePrices.reduce(
        (total, price) => total + BigInt(price.used),
        0n
      );

      const totalBaseFeesPaid: bigint = resourcePrices.reduce(
        (total, price) => total + BigInt(price.feePaid),
        0n
      );

      const averagePrice: bigint = totalBaseFeesPaid / totalGasUsed;

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
  }
};
