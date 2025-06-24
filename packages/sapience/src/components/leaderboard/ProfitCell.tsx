'use client';

import React from 'react';
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
  if (Number.isNaN(usdValue)) {
    console.error('Calculated PnL resulted in NaN', { value, wstEthPriceUsd });
    return <span>-</span>; // Display a dash or placeholder for NaN
  }

  return (
    <span>
      $
      {usdValue.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}
    </span>
  );
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

const ProfitCell = <TData,>({ row, table }: ProfitCellProps<TData>): React.ReactElement => {
  // Ensure the correct column ID is used, assumed to be 'totalPnL' based on previous context
  const rawValue = row.getValue('totalPnL');
  // Convert bigint to number if needed, with additional safety checks
  let value: number;
  if (typeof rawValue === 'bigint') {
    value = Number(rawValue);
  } else if (typeof rawValue === 'string') {
    value = parseFloat(rawValue);
  } else if (typeof rawValue === 'number') {
    value = rawValue;
  } else {
    value = 0; // fallback for any other type
  }
  
  const wstEthPriceUsd = table.options.meta?.wstEthPriceUsd ?? null; // Provide null as default

  // Render the display component with the extracted value and price
  return <PnLDisplay value={value} wstEthPriceUsd={wstEthPriceUsd} />;
};

export default ProfitCell;
