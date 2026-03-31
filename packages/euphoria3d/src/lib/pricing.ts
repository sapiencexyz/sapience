import { type Hex } from 'viem';
import { decodePythMarketId, decodePythLazerFeedId } from '@sapience/sdk/auction/encoding';
import { PYTH_FEED_NAMES, PYTH_FEED_HERMES_MAP } from '@sapience/sdk/constants';
import { OutcomeSide, type PickJson } from '@sapience/sdk/types';

export interface LegQuote {
  name: string;
  ticker: string;
  strike: number;
  expiry: string;
  expiryTs: number;
  predictedOutcome: 'Yes' | 'No';
  successProb: number | null;
}

export interface LocalBidData {
  counterparty: string;
  counterpartyCollateral: string;
  counterpartyNonce: number;
  counterpartyDeadline: number;
  counterpartySignature: string;
  counterpartySessionKeyData?: string;
}

export interface ComputedQuote {
  auctionId: string;
  legs: LegQuote[];
  predictorCollateral: string;
  bidAmount: string;
  fairBid: string;
  counterpartyWinProb: number;
  timestamp: number;
  bidSent?: boolean;
  bidSkipReason?: string;
  localBid?: LocalBidData;
}

const priceCache = new Map<number, { price: number; ts: number }>();
const CACHE_TTL = 5_000;

async function fetchSpotPrice(feedId: number): Promise<number | null> {
  const cached = priceCache.get(feedId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.price;

  const hermesId = PYTH_FEED_HERMES_MAP[feedId];
  if (!hermesId) return null;

  try {
    const resp = await fetch(
      `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${hermesId}`,
    );
    if (!resp.ok) return null;

    const data = (await resp.json()) as {
      parsed?: { price: { price: string; expo: number } }[];
    };
    const entry = data?.parsed?.[0];
    if (!entry) return null;

    const price = Number(entry.price.price) * Math.pow(10, entry.price.expo);
    priceCache.set(feedId, { price, ts: Date.now() });
    return price;
  } catch {
    return null;
  }
}

/** P(spot > strike at expiry) under log-normal dynamics (Black-Scholes digital) */
function computeOverProbability(spot: number, strike: number, T: number, vol: number): number {
  if (T <= 0) return spot >= strike ? 1 : 0;
  if (strike <= 0 || spot <= 0) return 0;

  const sqrtT = Math.sqrt(T);
  const d2 = (Math.log(spot / strike) - (vol * vol * T) / 2) / (vol * sqrtT);
  return normalCDF(d2);
}

function normalCDF(x: number): number {
  if (x > 6) return 1;
  if (x < -6) return 0;

  const a = Math.abs(x);
  const t = 1 / (1 + 0.2316419 * a);
  const d = 0.3989422804014327;
  const p =
    d *
    Math.exp(-0.5 * a * a) *
    (t *
      (0.31938153 +
        t *
          (-0.356563782 +
            t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))));

  return x >= 0 ? 1 - p : p;
}

function formatFeedName(feedId: number | null, priceId: string): string {
  if (feedId !== null) return PYTH_FEED_NAMES[feedId] ?? `feed#${feedId}`;
  return priceId.slice(0, 10);
}

export async function computeQuote(
  auctionId: string,
  picks: PickJson[],
  predictorCollateral: string,
  config: { edgeBps: number; maxBid: number; volatility: number; correlationCoeff?: number },
): Promise<ComputedQuote | null> {
  if (picks.length === 0) return null;

  const collateralBigInt = BigInt(predictorCollateral || '0');
  if (collateralBigInt === 0n) return null;

  let predictorWinProb = 1;
  let pricedLegs = 0;
  const legs: LegQuote[] = [];

  for (const pick of picks) {
    const market = decodePythMarketId(pick.conditionId as Hex);
    if (!market) {
      legs.push({
        name: pick.conditionId.slice(0, 12) + '...',
        ticker: '???',
        strike: 0,
        expiry: '',
        expiryTs: 0,
        predictedOutcome: pick.predictedOutcome === OutcomeSide.YES ? 'Yes' : 'No',
        successProb: null,
      });
      continue;
    }

    const feedId = decodePythLazerFeedId(market.priceId);
    const feedName = formatFeedName(feedId, market.priceId);
    const strike = Number(market.strikePrice) * Math.pow(10, market.strikeExpo);
    const expiry = new Date(Number(market.endTime) * 1000).toISOString().slice(0, 16);

    const now = Date.now() / 1000;
    const timeToExpiry = Number(market.endTime) - now;

    let yesProbability: number | null = null;
    if (timeToExpiry > 0 && feedId !== null) {
      const spot = await fetchSpotPrice(feedId);
      if (spot !== null) {
        const T = timeToExpiry / (365.25 * 24 * 3600);
        yesProbability = computeOverProbability(spot, strike, T, config.volatility);
      }
    }

    const successProb =
      yesProbability !== null
        ? pick.predictedOutcome === OutcomeSide.YES
          ? yesProbability
          : 1 - yesProbability
        : null;

    legs.push({
      name: `${feedName} ${market.overWinsOnTie ? '≥' : '>'} ${strike}`,
      ticker: feedName,
      strike,
      expiry,
      expiryTs: Number(market.endTime),
      predictedOutcome: pick.predictedOutcome === OutcomeSide.YES ? 'Yes' : 'No',
      successProb,
    });

    if (successProb !== null) {
      pricedLegs++;
      predictorWinProb *= successProb;
    }
  }

  if (pricedLegs === 0) return null;

  // Correlation adjustment: interpolate between independent and min-leg probability
  const rho = config.correlationCoeff ?? 0;
  if (rho !== 0 && pricedLegs >= 2) {
    const minLegProb = Math.min(...legs.filter((l) => l.successProb !== null).map((l) => l.successProb!));
    predictorWinProb = predictorWinProb + rho * (minLegProb - predictorWinProb);
    predictorWinProb = Math.max(0.001, Math.min(0.999, predictorWinProb));
  }

  const counterpartyWinProb = 1 - predictorWinProb;
  if (counterpartyWinProb < 0.05) return null;

  const fairBidFloat =
    (Number(collateralBigInt) * counterpartyWinProb) / predictorWinProb;
  const bidFloat = fairBidFloat * (1 - config.edgeBps / 10_000);

  const maxBidWei = BigInt(Math.floor(config.maxBid * 1e18));
  let bidAmount = BigInt(Math.floor(Math.max(0, bidFloat)));
  const fairBid = BigInt(Math.floor(Math.max(0, fairBidFloat)));
  if (bidAmount > maxBidWei) bidAmount = maxBidWei;
  if (bidAmount <= 0n) return null;

  return {
    auctionId,
    legs,
    predictorCollateral: formatEther(collateralBigInt),
    bidAmount: formatEther(bidAmount),
    fairBid: formatEther(fairBid),
    counterpartyWinProb,
    timestamp: Date.now(),
  };
}

function formatEther(wei: bigint): string {
  const str = wei.toString();
  if (str.length <= 18) {
    return '0.' + str.padStart(18, '0').replace(/0+$/, '') || '0';
  }
  const intPart = str.slice(0, str.length - 18);
  const decPart = str.slice(str.length - 18).replace(/0+$/, '');
  return decPart ? `${intPart}.${decPart}` : intPart;
}
