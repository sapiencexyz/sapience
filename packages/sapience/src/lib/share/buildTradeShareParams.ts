import type { PositionType } from '@sapience/ui/types';

export type TradeShareExtraParams = Record<string, string>;

export interface BuildTradeShareParamsOptions {
  wagerOverride?: number | string;
  payoutOverride?: number | string;
  extraParams?: TradeShareExtraParams;
}

export interface TradeShareParams {
  question: string;
  side?: string;
  wager: string;
  payout?: string;
  symbol?: string;
  groupAddress?: string;
  marketId?: number | string;
  positionId?: number | string;
  owner?: string;
  extraParams?: TradeShareExtraParams;
}

function formatAmount(val: number): string {
  if (!Number.isFinite(val)) return '0';
  return val.toFixed(val < 1 ? 4 : 2);
}

export function buildTradeShareParams(
  position: PositionType,
  opts: BuildTradeShareParamsOptions = {}
): TradeShareParams {
  const { wagerOverride, payoutOverride, extraParams } = opts;

  const market = position.market as any;
  const group = market?.marketGroup;

  const question: string = market?.question || 'Prediction Market';

  const baseTokenName: string | undefined = group?.baseTokenName;
  const baseBigInt = (() => {
    try {
      return BigInt(position.baseToken || '0');
    } catch {
      return 0n;
    }
  })();
  const borrowedBaseBigInt = (() => {
    try {
      return BigInt(position.borrowedBaseToken || '0');
    } catch {
      return 0n;
    }
  })();
  const net = baseBigInt - borrowedBaseBigInt;

  const side =
    baseTokenName === 'Yes'
      ? net >= 0n
        ? 'on Yes'
        : 'on No'
      : net >= 0n
        ? 'long'
        : 'short';

  const wager: string = (() => {
    try {
      if (typeof wagerOverride !== 'undefined') {
        const numeric =
          typeof wagerOverride === 'string'
            ? Number(wagerOverride)
            : wagerOverride;
        return formatAmount(Number(numeric));
      }
      const wei = BigInt(position.collateral || '0');
      const val = Number(wei) / 1e18;
      return formatAmount(val);
    } catch {
      return '0';
    }
  })();

  const symbol: string | undefined = group?.collateralSymbol || '';

  const maxPayout: string = (() => {
    if (baseTokenName !== 'Yes') return '';
    try {
      const isNetLongYes = net >= 0n;
      const amount = isNetLongYes ? baseBigInt : borrowedBaseBigInt;
      const val = Number(amount) / 1e18;
      return formatAmount(val);
    } catch {
      return '0';
    }
  })();

  const exitValue: string = (() => {
    if (typeof payoutOverride === 'undefined') return '';
    const numeric =
      typeof payoutOverride === 'string'
        ? Number(payoutOverride)
        : payoutOverride;
    return formatAmount(Number(numeric));
  })();

  const groupAddress: string | undefined = group?.address;
  const marketId: number | string | undefined = market?.marketId;
  const positionId: number | string | undefined = position.positionId;
  const owner: string | undefined = position.owner || undefined;

  const mergedExtraParams: TradeShareExtraParams | undefined = (() => {
    const out: TradeShareExtraParams = {};
    if (typeof wagerOverride !== 'undefined') out.entry = wager;
    if (exitValue) out.exit = exitValue;
    if (extraParams) {
      for (const [k, v] of Object.entries(extraParams)) {
        if (typeof v === 'string') out[k] = v;
      }
    }
    return Object.keys(out).length ? out : undefined;
  })();

  return {
    question,
    side,
    wager,
    payout: exitValue || (baseTokenName === 'Yes' ? maxPayout : undefined),
    symbol,
    groupAddress,
    marketId,
    positionId,
    owner,
    extraParams: mergedExtraParams,
  };
}
