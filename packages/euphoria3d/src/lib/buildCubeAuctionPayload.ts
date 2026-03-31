import { type Address, type Hex, zeroAddress } from 'viem';
import { getPythMarketId } from '@sapience/sdk/auction/encoding';
import { canonicalizePicks } from '@sapience/sdk/auction/escrowEncoding';
import { predictionMarketEscrow, pythConditionResolver } from '@sapience/sdk/contracts';
import { OutcomeSide } from '@sapience/sdk/types';
import type { AuctionRFQPayload } from '@sapience/sdk/types';
import type { SelectedFeed } from '../components/TickerPicker';

const DEFAULT_COLLATERAL_WEI = '1000000000000000000'; // 1 USDe

function toWei(usde: number): string {
  // Convert USDe amount to wei (18 decimals)
  const wei = BigInt(Math.round(usde * 1e18));
  return wei.toString();
}

function feedIdToBytes32(feedId: number): Hex {
  return `0x${feedId.toString(16).padStart(64, '0')}`;
}

function buildPick(
  feed: SelectedFeed,
  currentPrice: number,
  isOver: boolean,
  expirySeconds: number,
  chainId: number,
) {
  const nowSec = Math.floor(Date.now() / 1000);
  const strikePrice = BigInt(Math.round(currentPrice * Math.pow(10, -feed.expo)));

  const conditionId = getPythMarketId({
    priceId: feedIdToBytes32(feed.id),
    endTime: BigInt(nowSec + expirySeconds),
    strikePrice,
    strikeExpo: feed.expo,
    overWinsOnTie: true,
  });

  const resolver = pythConditionResolver[chainId]?.address ?? zeroAddress;

  return {
    conditionResolver: resolver,
    conditionId,
    predictedOutcome: isOver ? OutcomeSide.YES : OutcomeSide.NO,
  };
}

/**
 * Build an auction RFQ payload for a three-leg Pyth prediction.
 * @param expirySeconds - seconds until expiry (e.g. 300 for 5 min)
 * @param sizeUsde - collateral amount in USDe (default 1)
 */
function generateRandomNonce(): number {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0];
}

export function buildCubeAuctionPayload(
  leg1: SelectedFeed,
  leg2: SelectedFeed,
  leg3: SelectedFeed,
  leg1Price: number,
  leg2Price: number,
  leg3Price: number,
  leg1Over: boolean,
  leg2Over: boolean,
  leg3Over: boolean,
  expirySeconds: number,
  sizeUsde: number = 1,
  predictor?: Address,
  chainId?: number,
): AuctionRFQPayload {
  const cid = chainId ?? 5064014;
  const pick1 = buildPick(leg1, leg1Price, leg1Over, expirySeconds, cid);
  const pick2 = buildPick(leg2, leg2Price, leg2Over, expirySeconds, cid);
  const pick3 = buildPick(leg3, leg3Price, leg3Over, expirySeconds, cid);

  const nowSec = Math.floor(Date.now() / 1000);
  const escrow = predictionMarketEscrow[cid]?.address ?? zeroAddress;
  const collateral = sizeUsde > 0 ? toWei(sizeUsde) : DEFAULT_COLLATERAL_WEI;
  const nonce = generateRandomNonce();

  return {
    picks: canonicalizePicks([pick1, pick2, pick3]),
    predictorCollateral: collateral,
    predictor: predictor ?? zeroAddress,
    predictorNonce: nonce,
    predictorDeadline: nowSec + 600,
    chainId: cid,
    escrowContract: escrow,
  };
}

export { DEFAULT_COLLATERAL_WEI };
