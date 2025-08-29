'use client';

import type { Row, Table } from '@tanstack/react-table';
import type React from 'react';

// Helper component for displaying the formatted PnL value
const PnLDisplay = ({
  value,
  wstEthPriceUsd,
  collateralAddress,
  isAlreadyUsd = false,
}: {
  value: number;
  wstEthPriceUsd: number | null;
  collateralAddress?: string;
  isAlreadyUsd?: boolean;
}) => {
  let usdValue: number;
  
  if (isAlreadyUsd) {
    // Value is already in USD (from aggregated leaderboard)
    usdValue = value;
  } else {
    // Convert from token amount to USD (for market-specific leaderboard)
    const displayValue = value / 1e18;
    
    // Determine price based on collateral address
    let effectivePrice = wstEthPriceUsd ?? 1800; // Default fallback for wstETH
    
    // Check if this is your testUSDe token
    if (collateralAddress?.toLowerCase() === '0xeedd0ed0e6cc8adc290189236d9645393ae54bc3') {
      effectivePrice = 1.0; // testUSDe is always $1
    }
    
    usdValue = displayValue * effectivePrice;
  }

  // Handle potential NaN values gracefully
  if (Number.isNaN(usdValue)) {
    console.error('Calculated PnL resulted in NaN', { value, wstEthPriceUsd, collateralAddress });
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

  const wstEthPriceUsd = table.options.meta?.wstEthPriceUsd ?? null; // Provide null as default
  const collateralAddress = table.options.meta?.collateralAddress;
  const isAlreadyUsd = table.options.meta?.isAlreadyUsd ?? false;

  // Render the display component with the extracted value and price
  return <PnLDisplay value={value} wstEthPriceUsd={wstEthPriceUsd} collateralAddress={collateralAddress} isAlreadyUsd={isAlreadyUsd} />;
};

export default ProfitCell;
