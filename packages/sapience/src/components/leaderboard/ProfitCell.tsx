'use client';

import type { Row, Table } from '@tanstack/react-table';

// Helper component for displaying the formatted PnL value
const PnLDisplay = ({
  value,
  wstEthPriceUsd,
}: {
  value: number;
  wstEthPriceUsd: number | null;
}) => {
  const displayValue = value / 1e18;
  // Use a fallback price if the price is unavailable, maybe log this occurrence
  const effectivePrice = wstEthPriceUsd ?? 1800;
  const usdValue = displayValue * effectivePrice;

  // Handle potential NaN values gracefully
  if (isNaN(usdValue)) {
    console.error('Calculated PnL resulted in NaN', { value, wstEthPriceUsd });
    return <span>-</span>; // Display a dash or placeholder for NaN
  }

  return <span>${usdValue.toFixed(2)}</span>;
};

interface ProfitCellProps<TData> {
  row: Row<TData>;
  table: Table<TData> & {
    options: {
      meta?: {
        wstEthPriceUsd?: number | null;
      };
    };
  };
}

const ProfitCell = <TData,>({ row, table }: ProfitCellProps<TData>) => {
  // Ensure the correct column ID is used, assumed to be 'totalPnL' based on previous context
  const value = row.getValue('totalPnL') as number;
  const wstEthPriceUsd = table.options.meta?.wstEthPriceUsd ?? null; // Provide null as default

  // Render the display component with the extracted value and price
  return <PnLDisplay value={value} wstEthPriceUsd={wstEthPriceUsd} />;
};

export default ProfitCell;
