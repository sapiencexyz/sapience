import { parseDateTimeLocalToUnixSeconds } from '@sapience/sdk/auction/buildAuctionPayload';

// Strip the Pyth feed namespace so only the symbol remains
// (`Crypto.BTC/USD` → `BTC/USD`, `Equity.US.AAPL` → `AAPL`).
export function formatPythFeedLabel(label: string | undefined): string {
  const raw = label ?? 'Crypto';
  const lastDot = raw.lastIndexOf('.');
  return lastDot >= 0 ? raw.slice(lastDot + 1) : raw;
}

// Display the strike price at the same precision that's actually submitted on-chain.
// `targetPriceRaw` is the user-entered decimal string; we only add thousand separators
// to the integer part and preserve the fractional part verbatim. Falls back to
// `targetPrice` (number) when raw is missing.
export function formatPythTargetPriceDisplay(
  targetPriceRaw: string | undefined,
  targetPrice: number
): string {
  const raw =
    targetPriceRaw && targetPriceRaw.trim().length > 0
      ? targetPriceRaw.trim()
      : Number.isFinite(targetPrice)
        ? String(targetPrice)
        : '';
  if (!raw) return '';
  const [intPart, fracPart] = raw.split('.');
  const intNum = Number(intPart);
  const formattedInt = Number.isFinite(intNum)
    ? intNum.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : intPart;
  return fracPart !== undefined ? `${formattedInt}.${fracPart}` : formattedInt;
}

// Same parse rules as the on-chain endTime encoding — ensures the displayed
// duration is computed from the same instant we submit. Returns null on invalid input.
export function parsePythEndDate(dateTimeLocal: string): Date | null {
  try {
    const unixSec = parseDateTimeLocalToUnixSeconds(dateTimeLocal);
    return new Date(Number(unixSec) * 1000);
  } catch {
    return null;
  }
}

// Floor at each boundary so we never round up into the next unit
// (e.g. 59m50s shows as `59M`, not `60M`; 23h59m stays `23H`, not `1D`).
// Sub-minute remaining time renders as `<1M` so the row never shows `0M`.
export function formatPythDurationFromNow(
  endMs: number,
  nowMs: number
): string {
  const ms = Math.max(0, endMs - nowMs);
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return `<1M`;
  if (mins < 60) return `${mins}M`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}H`;
  return `${Math.floor(hours / 24)}D`;
}
