import { formatDistanceToNow } from 'date-fns';

export interface UiTransaction {
  id: number;
  type: string;
  createdAt: string;
  collateral: string;
  collateralTransfer?: { collateral?: string | null } | null;
  event?: { transactionHash?: string | null } | null;
  position?: {
    owner?: string | null;
    positionId?: string | number | null;
    isLP?: boolean | null;
    market?: {
      optionName?: string | null;
      marketId?: string | number | null;
      marketGroup?: {
        chainId?: number | null;
        address?: string | null;
        collateralSymbol?: string | null;
        collateralDecimals?: number | null;
      } | null;
    } | null;
  } | null;
}

function shortenAddress(address?: string | null, chars: number = 4): string {
  if (!address) return '';
  const a = address.toLowerCase();
  if (a.length <= chars * 2 + 2) return a;
  return `${a.slice(0, 2 + chars)}…${a.slice(a.length - chars)}`;
}

function fromWeiToFloat(
  raw: string | undefined | null,
  decimals: number = 18
): number {
  if (!raw) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return n / Math.pow(10, decimals);
}

function getTransactionTypeLabel(type: string): {
  label: string;
  className?: string;
} {
  switch (type) {
    case 'addLiquidity':
    case 'ADD_LIQUIDITY':
      return {
        label: 'Add Liquidity',
        className: 'border-blue-500/40 bg-blue-500/10 text-blue-600',
      };
    case 'removeLiquidity':
    case 'REMOVE_LIQUIDITY':
      return {
        label: 'Remove Liquidity',
        className: 'border-blue-500/40 bg-blue-500/10 text-blue-600',
      };
    case 'long':
    case 'LONG':
      return {
        label: 'Long',
        className: 'border-green-500/40 bg-green-500/10 text-green-600',
      };
    case 'short':
    case 'SHORT':
      return {
        label: 'Short',
        className: 'border-red-500/40 bg-red-500/10 text-red-600',
      };
    case 'settledPosition':
    case 'SETTLED_POSITION':
      return { label: 'Settled Position' };
    case 'mintParlayNFTs':
    case 'MINT_PARLAY_NFTS':
      return { label: 'Create Parlay' };
    case 'burnParlayNFTs':
    case 'BURN_PARLAY_NFTS':
      return { label: 'Burn Parlay' };
    default:
      return { label: type };
  }
}

export function DefaultTransactionRow({ tx }: { tx: UiTransaction }) {
  const owner = tx.position?.owner || '';
  const decimals = tx.position?.market?.marketGroup?.collateralDecimals ?? 18;
  const symbol = tx.position?.market?.marketGroup?.collateralSymbol || '';
  const valueWei = tx.collateralTransfer?.collateral ?? tx.collateral;
  const value = fromWeiToFloat(valueWei, decimals);
  const typeUi = getTransactionTypeLabel(tx.type);
  const optionName = tx.position?.market?.optionName || '';
  const positionId = tx.position?.positionId ?? '';
  const isLiquidity = Boolean(tx.position?.isLP);
  const created = new Date(tx.createdAt);
  const exact = created.toLocaleString();
  return (
    <tr className="border-b align-top">
      <td className="px-4 py-3">
        <div className="font-medium" title={exact}>
          {formatDistanceToNow(created, { addSuffix: true })}
        </div>
        <div className="text-xs text-muted-foreground">{exact}</div>
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center rounded border px-2 py-1 text-xs ${typeUi.className || ''}`}
        >
          {typeUi.label}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <span className="font-medium">
            {Math.abs(value).toLocaleString(undefined, {
              maximumFractionDigits: 6,
            })}
          </span>
          {symbol ? (
            <span className="text-muted-foreground">{symbol}</span>
          ) : null}
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="font-mono text-foreground" title={owner}>
          {shortenAddress(owner)}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {positionId ? (
            <span className="whitespace-nowrap">#{positionId}</span>
          ) : null}
          <span className="inline-flex items-center rounded border px-2 py-0.5 text-xs text-muted-foreground">
            {isLiquidity ? 'Liquidity' : 'Trader'}
          </span>
          {optionName ? (
            <span
              className="inline-flex max-w-[220px] truncate items-center rounded border px-2 py-0.5 text-xs"
              title={optionName}
            >
              {optionName}
            </span>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

// Sketch: Specialized row for Mint Parlay
export function MintParlayNFTTransactionRow({ tx }: { tx: UiTransaction }) {
  return <DefaultTransactionRow tx={tx} />;
}

// Sketch: Specialized row for Burn Parlay
export function BurnParlayNFTTransactionRow({ tx }: { tx: UiTransaction }) {
  const base = getTransactionTypeLabel('BURN_PARLAY_NFTS');
  const cloned: UiTransaction = { ...tx, type: base.label };
  return <DefaultTransactionRow tx={cloned} />;
}
