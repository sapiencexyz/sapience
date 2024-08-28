import { Event } from "../entity/Event";
import { Position } from "../entity/Position";
import dataSource, { initializeDataSource } from "../db";
import { LiquidityPositionEventLog } from "../interfaces/interfaces";
export const upsertPositionFromLiquidityEvent = async (event: Event) => {
  await initializeDataSource();

  const positionRepository = dataSource.getRepository(Position);

  // create new position
  /*
  const eventArgs = event.logData.args as LiquidityPositionEventLog;
  const newPosition = new Position();
  newPosition.contractId = event.contractId;
  newPosition.nftId = Number(eventArgs.tokenId);
  newPosition.baseToken = eventArgs.addedAmount0;
  newPosition.quoteToken = eventArgs.addedAmount1;
  newPosition.collateral = "0";
  newPosition.profitLoss = 0;
  newPosition.isLP = true;
  newPosition.highPrice = 0;
  newPosition.lowPrice = 0;
  newPosition.unclaimedFees = 0;

  await positionRepository.upsert(newPosition, ["contractId", "nftId"]);
  */
};
