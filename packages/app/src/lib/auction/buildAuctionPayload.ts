import {
  pythResolver,
  umaResolver,
  lzPMResolver,
} from '@sapience/sdk/contracts';
import { CHAIN_ID_ETHEREAL, DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import {
  encodePythBinaryOptionOutcomes,
  encodeUmaPredictedOutcomes,
  type PythBinaryOptionOutcome,
  type UmaPredictedOutcome,
} from '@sapience/sdk';

export interface PredictedOutcomeInputStub {
  marketId: string; // The id from API (already encoded claim:endTime)
  prediction: boolean;
}

export interface PythOutcomeInputStub {
  /**
   * For `PythResolver.sol` (Lazer-based), this must represent a **uint32 feedId**
   * (NOT a Hermes bytes32 price feed id).
   *
   * Accepted formats:
   * - base-10 integer string: "1"
   * - hex uint32 (no padding): "0x1" / "01" / "deadbeef"
   * - bytes32 hex that fits uint32 (high bits zero): "0x000...0001"
   */
  priceId: string;
  direction: 'over' | 'under';
  targetPrice: number;
  targetPriceRaw?: string;
  priceExpo: number;
  dateTimeLocal: string; // YYYY-MM-DDTHH:MM in local time
  overWinsOnTie?: boolean;
}

function normalizeUmaOutcomes(
  outcomes: PredictedOutcomeInputStub[]
): UmaPredictedOutcome[] {
  return outcomes.map((o) => ({
    marketId: (o.marketId.startsWith('0x')
      ? o.marketId
      : `0x${o.marketId}`) as `0x${string}`,
    prediction: !!o.prediction,
  }));
}

function parseDateTimeLocalToUnixSeconds(value: string): bigint {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) throw new Error('invalid_datetime_local');
  const yyyy = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  const hh = Number(m[4]);
  const min = Number(m[5]);
  const d = new Date(yyyy, mm - 1, dd, hh, min);
  const ms = d.getTime();
  if (Number.isNaN(ms)) throw new Error('invalid_datetime_local');
  return BigInt(Math.floor(ms / 1000));
}

function pow10(n: number): bigint {
  if (n < 0) throw new Error('pow10_negative');
  let out = 1n;
  for (let i = 0; i < n; i++) out *= 10n;
  return out;
}

function decimalToScaledBigInt(value: string, scale: number): bigint {
  // Returns bigint(round(value * 10^scale)).
  // `value` is a base-10 decimal string (e.g. "123.45").
  const s = value.trim();
  if (!s) throw new Error('invalid_decimal');
  if (s.startsWith('-')) throw new Error('negative_decimal_not_supported');
  const parts = s.split('.');
  if (parts.length > 2) throw new Error('invalid_decimal');
  const intPart = parts[0] || '0';
  const fracPart = parts[1] || '';
  const digitsStr = `${intPart}${fracPart}`.replace(/^0+(?=\d)/, '');
  const digits = BigInt(digitsStr.length ? digitsStr : '0');
  const fracLen = fracPart.length;

  const exp = scale - fracLen;
  if (exp >= 0) {
    return digits * pow10(exp);
  }

  const denom = pow10(-exp);
  const q = digits / denom;
  const r = digits % denom;
  // round half up
  return r * 2n >= denom ? q + 1n : q;
}

function normalizePythPriceId(raw: string): `0x${string}` {
  const s = raw.trim();
  if (!s) throw new Error('invalid_price_id');

  // IMPORTANT:
  // `PythResolver.sol` expects `priceId` to encode a **uint32 Pyth Lazer feedId**
  // in the low bits of a bytes32 (high bits MUST be zero).
  const UINT32_MAX = 0xffff_ffffn;

  // base-10 integer string
  if (/^\d+$/.test(s)) {
    const v = BigInt(s);
    if (v > UINT32_MAX) throw new Error('pyth_feed_id_must_be_uint32');
    return `0x${v.toString(16).padStart(64, '0')}`;
  }

  const hex = s.startsWith('0x') ? s : `0x${s}`;
  if (!/^0x[0-9a-fA-F]+$/.test(hex)) throw new Error('invalid_price_id');
  const noPrefix = hex.slice(2);
  if (noPrefix.length === 0) throw new Error('invalid_price_id');

  // Allow:
  // - 1..8 hex chars (uint32) -> left pad to bytes32
  // - 64 hex chars (bytes32) but ONLY if it fits uint32 (high bits zero)
  if (noPrefix.length <= 8) {
    const v = BigInt(hex);
    if (v > UINT32_MAX) throw new Error('pyth_feed_id_must_be_uint32');
    return `0x${v.toString(16).padStart(64, '0')}`;
  }

  if (noPrefix.length === 64) {
    const v = BigInt(hex);
    if (v > UINT32_MAX) {
      // This most commonly indicates a Hermes bytes32 feed id, which is NOT compatible
      // with the Lazer-based `PythResolver.sol` used on-chain.
      throw new Error('pyth_lazer_feed_id_required_not_hermes_price_id');
    }
    return `0x${v.toString(16).padStart(64, '0')}`;
  }

  throw new Error('invalid_price_id_length');
}

function normalizePythOutcomes(
  outcomes: PythOutcomeInputStub[]
): PythBinaryOptionOutcome[] {
  return outcomes.map((o) => {
    const endTime = parseDateTimeLocalToUnixSeconds(o.dateTimeLocal);
    const priceId = normalizePythPriceId(o.priceId);
    const strikeExpo = o.priceExpo;
    if (!Number.isFinite(strikeExpo)) throw new Error('missing_price_expo');

    // Strike price must be encoded using the same exponent as the feed.
    // Resolver compares the integer benchmarkPrice (from update) against strikePrice with matching expo.
    const strikeScale = -strikeExpo; // strikeInt ~= decimal * 10^(-expo)
    const strikeDecimal =
      (o.targetPriceRaw && o.targetPriceRaw.trim().length > 0
        ? o.targetPriceRaw
        : String(o.targetPrice)) || '0';
    const strikePrice = decimalToScaledBigInt(strikeDecimal, strikeScale);

    return {
      priceId,
      endTime,
      strikePrice,
      strikeExpo,
      overWinsOnTie: o.overWinsOnTie ?? true,
      prediction: o.direction === 'over',
    } satisfies PythBinaryOptionOutcome;
  });
}

export function buildAuctionStartPayload(
  outcomes: PredictedOutcomeInputStub[],
  chainId?: number
): { resolver: `0x${string}`; predictedOutcomes: `0x${string}`[] } {
  // Select the correct resolver based on chain ID
  const targetChainId = chainId || DEFAULT_CHAIN_ID;
  let resolverAddress: `0x${string}` | undefined;

  if (targetChainId === CHAIN_ID_ETHEREAL) {
    resolverAddress = lzPMResolver[CHAIN_ID_ETHEREAL]?.address;
  } else {
    resolverAddress = umaResolver[targetChainId]?.address as
      | `0x${string}`
      | undefined;
  }

  const resolver: `0x${string}` =
    resolverAddress ||
    ('0x0000000000000000000000000000000000000000' as `0x${string}`);

  // Resolver expects a single bytes blob with abi.encode(PredictedOutcome[])
  const encoded = encodeUmaPredictedOutcomes(normalizeUmaOutcomes(outcomes));
  const predictedOutcomes = [encoded];

  return { resolver, predictedOutcomes };
}

export function buildPythAuctionStartPayload(
  outcomes: PythOutcomeInputStub[],
  chainId?: number
): { resolver: `0x${string}`; predictedOutcomes: `0x${string}`[] } {
  const targetChainId = chainId || DEFAULT_CHAIN_ID;
  const resolverAddress = pythResolver[targetChainId]?.address as
    | `0x${string}`
    | undefined;
  const resolver: `0x${string}` =
    resolverAddress ||
    ('0x0000000000000000000000000000000000000000' as `0x${string}`);

  const encoded = encodePythBinaryOptionOutcomes(
    normalizePythOutcomes(outcomes)
  );
  return { resolver, predictedOutcomes: [encoded] };
}
