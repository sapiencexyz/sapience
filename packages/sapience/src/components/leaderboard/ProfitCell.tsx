'use client';

import type { Row, Table } from '@tanstack/react-table';
import type React from 'react';

// Helper component for displaying the formatted PnL value
const PnLDisplay = ({
  value,
  collateralAddress,
  isAlreadyUsd = false,
}: {
  value: number;
  collateralAddress?: string;
  isAlreadyUsd?: boolean;
}) => {
  let usdValue: number;

  if (isAlreadyUsd) {
    // Value is already in USD (from aggregated leaderboard)
    usdValue = value;
  } else {
    // Value is already in token amounts, convert to USD for known tokens
    if (
      collateralAddress?.toLowerCase() ===
      '0xeedd0ed0e6cc8adc290189236d9645393ae54bc3'
    ) {
      // testUSDe is always $1
      usdValue = value * 1.0;
    } else {
      // For other tokens, just show the token amount (no USD conversion)
      usdValue = value;
    }
  }

  // Handle potential NaN values gracefully
  if (Number.isNaN(usdValue)) {
    console.error('Calculated PnL resulted in NaN', {
      value,
      collateralAddress,
    });
    return <span>-</span>; // Display a dash or placeholder for NaN
  }

  const shouldUseTestUSDe =
    isAlreadyUsd ||
    collateralAddress?.toLowerCase() ===
      '0xeedd0ed0e6cc8adc290189236d9645393ae54bc3';

  return (
    <span>
      {usdValue.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}
      {shouldUseTestUSDe ? ' testUSDe' : ''}
    </span>
  );
};

interface ProfitCellProps<TData> {
  row: Row<TData>;
  table: Table<TData> & {
    options: {
      meta?: {
        collateralAddress?: string;
        isAlreadyUsd?: boolean;
      };
    };
  };
}

const ProfitCell = <TData,>({
  row,
  table,
}: ProfitCellProps<TData>): React.ReactElement => {
  // Ensure the correct column ID is used, assumed to be 'totalPnL' based on previous context
  const rawValue = row.getValue('totalPnL');
  // Convert to number (values should already be in correct format after DB change)
  let value: number;
  if (typeof rawValue === 'string') {
    value = parseFloat(rawValue);
  } else if (typeof rawValue === 'number') {
    value = rawValue;
  } else {
    value = 0; // fallback for any other type
  }

  const collateralAddress = table.options.meta?.collateralAddress;
  const isAlreadyUsd = table.options.meta?.isAlreadyUsd ?? false;

  // Render the display component with the extracted value
  return (
    <PnLDisplay
      value={value}
      collateralAddress={collateralAddress}
      isAlreadyUsd={isAlreadyUsd}
    />
  );
};

export default ProfitCell;
