'use client';

import type { Row, Table } from '@tanstack/react-table';
import type React from 'react';

// Helper component for displaying the formatted PnL value
const PnLDisplay = ({ value }: { value: number }) => {
  // Assume all tokens are worth $1 and display in testUSDe
  const usdValue = value;

  // Handle potential NaN values gracefully
  if (Number.isNaN(usdValue)) {
    console.error('Calculated PnL resulted in NaN', {
      value,
    });
    return <span>-</span>; // Display a dash or placeholder for NaN
  }

  return (
    <span>
      {usdValue.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}
      {' testUSDe'}
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
  table: _table,
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

  // Render the display component with the extracted value
  return <PnLDisplay value={value} />;
};

export default ProfitCell;
