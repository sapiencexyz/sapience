import { decodeAbiParameters } from 'viem';
import {
  pythResolver,
  umaResolver,
  lzPMResolver,
} from '@sapience/sdk/contracts';

export type UmaDecodedOutcome = {
  kind: 'uma';
  marketId: `0x${string}`;
  prediction: boolean;
};

export type PythDecodedOutcome = {
  kind: 'pyth';
  priceId: `0x${string}`;
  endTime: bigint;
  strikePrice: bigint;
  strikeExpo: number;
  overWinsOnTie: boolean;
  prediction: boolean; // true = Over, false = Under
};

export type DecodedOutcomes =
  | { kind: 'uma'; outcomes: UmaDecodedOutcome[] }
  | { kind: 'pyth'; outcomes: PythDecodedOutcome[] }
  | { kind: 'unknown'; outcomes: [] };

function normalizeAddress(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!s) return null;
  return s.toLowerCase();
}

const UMA_RESOLVER_SET = new Set<string>(
  [
    ...Object.values(umaResolver).map((v) => v?.address),
    ...Object.values(lzPMResolver).map((v) => v?.address),
  ]
    .filter(Boolean)
    .map((a) => String(a).toLowerCase())
);

const PYTH_RESOLVER_SET = new Set<string>(
  Object.values(pythResolver)
    .map((v) => v?.address)
    .filter(Boolean)
    .map((a) => String(a).toLowerCase())
);

export function decodeAuctionPredictedOutcomes(params: {
  resolver?: unknown;
  predictedOutcomes?: unknown;
}): DecodedOutcomes {
  const resolverAddr = normalizeAddress(params.resolver);
  const arr = Array.isArray(params.predictedOutcomes)
    ? (params.predictedOutcomes as `0x${string}`[])
    : typeof params.predictedOutcomes === 'string'
      ? ([params.predictedOutcomes] as `0x${string}`[])
      : [];
  const encoded = arr[0] as `0x${string}` | undefined;
  if (!encoded) return { kind: 'unknown', outcomes: [] };

  try {
    if (resolverAddr && PYTH_RESOLVER_SET.has(resolverAddr)) {
      const decodedUnknown = decodeAbiParameters(
        [
          {
            type: 'tuple[]',
            components: [
              { name: 'priceId', type: 'bytes32' },
              { name: 'endTime', type: 'uint64' },
              { name: 'strikePrice', type: 'int64' },
              { name: 'strikeExpo', type: 'int32' },
              { name: 'overWinsOnTie', type: 'bool' },
              { name: 'prediction', type: 'bool' },
            ],
          },
        ] as const,
        encoded
      ) as unknown;
      const decodedArr = Array.isArray(decodedUnknown)
        ? ((decodedUnknown as any)[0] as Array<{
            priceId: `0x${string}`;
            endTime: bigint;
            strikePrice: bigint;
            strikeExpo: number;
            overWinsOnTie: boolean;
            prediction: boolean;
          }>)
        : [];
      const outcomes: PythDecodedOutcome[] = (decodedArr || []).map((o) => ({
        kind: 'pyth',
        priceId: o.priceId,
        endTime: BigInt(o.endTime),
        strikePrice: BigInt(o.strikePrice),
        strikeExpo: Number(o.strikeExpo),
        overWinsOnTie: Boolean(o.overWinsOnTie),
        prediction: Boolean(o.prediction),
      }));
      return { kind: 'pyth', outcomes };
    }

    if (!resolverAddr || UMA_RESOLVER_SET.has(resolverAddr)) {
      const decodedUnknown = decodeAbiParameters(
        [
          {
            type: 'tuple[]',
            components: [
              { name: 'marketId', type: 'bytes32' },
              { name: 'prediction', type: 'bool' },
            ],
          },
        ] as const,
        encoded
      ) as unknown;
      const decodedArr = Array.isArray(decodedUnknown)
        ? ((decodedUnknown as any)[0] as Array<{
            marketId: `0x${string}`;
            prediction: boolean;
          }>)
        : [];
      const outcomes: UmaDecodedOutcome[] = (decodedArr || []).map((o) => ({
        kind: 'uma',
        marketId: o.marketId,
        prediction: Boolean(o.prediction),
      }));
      return { kind: 'uma', outcomes };
    }
  } catch {
    // fall through
  }

  return { kind: 'unknown', outcomes: [] };
}

export function formatPythPriceDecimalFromInt(
  priceInt: bigint,
  expo: number
): string {
  const sign = priceInt < 0n ? '-' : '';
  const digits = (priceInt < 0n ? -priceInt : priceInt).toString(10);
  if (!digits || /^0+$/.test(digits)) return '0';

  if (expo >= 0) return `${sign}${digits}${'0'.repeat(expo)}`;

  const places = Math.abs(expo);
  let out: string;
  if (digits.length <= places) {
    out = `0.${'0'.repeat(places - digits.length)}${digits}`;
  } else {
    const i = digits.length - places;
    out = `${digits.slice(0, i)}.${digits.slice(i)}`;
  }
  out = out.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return sign + out;
}

export function formatUnixSecondsToLocalInput(value: bigint): string {
  const ms = Number(value) * 1000;
  const d = new Date(ms);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
    d.getDate()
  )}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
