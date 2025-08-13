import { NumberDisplay } from '@sapience/ui/components/NumberDisplay';
import { Button } from '@sapience/ui/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sapience/ui/components/ui/table';
import type { ColumnDef } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import React from 'react';

import type { FormattedAttestation } from '~/hooks/graphql/usePredictions';
import { getAttestationViewURL } from '~/lib/constants/eas';
import { YES_SQRT_X96_PRICE } from '~/lib/constants/numbers';
import { useSapience } from '~/lib/context/SapienceProvider';
import { sqrtPriceX96ToPriceD18 } from '~/lib/utils/util';

// Helper function to extract market address from context or props
// Since market address is not available in the attestation data directly,
// we'll need to use parentMarketAddress when available
const getMarketAddressForAttestation = (
  attestation: FormattedAttestation,
  parentMarketAddress?: string,
  marketGroups?: ReturnType<typeof useSapience>['marketGroups']
): string | null => {
  // If we have a parent market address (single market context), use it
  if (parentMarketAddress) {
    return parentMarketAddress.toLowerCase();
  }

  // For profile view with multiple markets, we need to find the market group
  // that contains this marketId. This is a limitation of the current data structure.
  if (marketGroups && attestation.marketId) {
    const marketId = parseInt(attestation.marketId, 16);
    for (const group of marketGroups) {
      const market = group.markets?.find((m: any) => m.marketId === marketId);
      if (market && group.address) {
        return group.address.toLowerCase();
      }
    }
  }

  return null;
};

// Helper function to extract market ID from attestation data
const extractMarketIdHex = (
  attestation: FormattedAttestation
): string | null => {
  // Use the marketId directly from the formatted attestation
  return attestation.marketId || null;
};

// Helper function to check if market group has multiple markets
const hasMultipleMarkets = (
  marketAddress: string,
  marketGroups: ReturnType<typeof useSapience>['marketGroups']
): boolean => {
  const marketGroup = marketGroups.find(
    (group) => group.address?.toLowerCase() === marketAddress
  );

  return Boolean(
    marketGroup &&
      marketGroup.markets &&
      Array.isArray(marketGroup.markets) &&
      marketGroup.markets.length > 1
  );
};

interface PredictionPositionsTableProps {
  attestations: FormattedAttestation[] | undefined;
  parentMarketAddress?: string;
  parentChainId?: number;
  parentMarketId?: number;
}

const renderSubmittedCell = ({
  row,
}: {
  row: { original: FormattedAttestation };
}) => {
  const date = new Date(Number(row.original.rawTime) * 1000);
  return formatDistanceToNow(date, { addSuffix: true });
};

const renderPredictionCell = ({
  row,
  marketGroups,
  isMarketsLoading,
  parentMarketAddress,
}: {
  row: { original: FormattedAttestation };
  marketGroups: ReturnType<typeof useSapience>['marketGroups'];
  isMarketsLoading: boolean;
  parentMarketAddress?: string;
}) => {
  const marketAddress = getMarketAddressForAttestation(
    row.original,
    parentMarketAddress,
    marketGroups
  );

  let baseTokenName = '';
  if (!isMarketsLoading && marketAddress) {
    const marketGroup = marketGroups.find(
      (group) => group.address?.toLowerCase() === marketAddress
    );
    if (marketGroup) {
      baseTokenName = marketGroup.baseTokenName || '';
    }
  }

  const { value } = row.original; // value is a string

  // Conditionally render 'Yes'/'No' if baseTokenName is 'Yes'
  if (baseTokenName.toLowerCase() === 'yes') {
    // Assumes the value is either '79228162514264337593543950336' for Yes or '0' for No
    const priceD18 = sqrtPriceX96ToPriceD18(BigInt(value));
    const YES_SQRT_X96_PRICE_D18 = sqrtPriceX96ToPriceD18(YES_SQRT_X96_PRICE);
    const percentageD2 = (priceD18 * BigInt(10000)) / YES_SQRT_X96_PRICE_D18;
    const percentage = Math.round(Number(percentageD2) / 100);
    return (
      <span className={percentage >= 50 ? 'text-green-600' : 'text-red-600'}>
        {percentage + '%'}
      </span>
    );
  }

  // For other cases, check if the value is numeric and format accordingly
  const numericValue = parseFloat(value);
  if (!isNaN(numericValue)) {
    // If the number is very large (likely wei), convert appropriately
    if (numericValue > 1e15) {
      // This might be a wei value, convert to a more readable format
      const convertedValue = numericValue / 1e18;
      return <NumberDisplay value={convertedValue} precision={6} />;
    }
    // For smaller numbers, display as is with appropriate formatting
    return <NumberDisplay value={numericValue} precision={6} />;
  }

  // Fallback for non-numeric values
  return `${value} ${baseTokenName || ''}`.trim();
};

const renderQuestionCell = ({
  row,
  marketGroups,
  isMarketsLoading,
  parentMarketAddress,
}: {
  row: { original: FormattedAttestation };
  marketGroups: ReturnType<typeof useSapience>['marketGroups'];
  isMarketsLoading: boolean;
  parentMarketAddress?: string;
}) => {
  const marketAddress = getMarketAddressForAttestation(
    row.original,
    parentMarketAddress,
    marketGroups
  );
  const marketIdHex = extractMarketIdHex(row.original);

  if (isMarketsLoading) {
    return (
      <span className="text-muted-foreground italic">Loading question...</span>
    );
  }

  if (marketAddress && marketIdHex) {
    const marketId = parseInt(marketIdHex, 16); // Convert hex to number

    const marketGroup = marketGroups.find(
      (group) => group.address?.toLowerCase() === marketAddress
    );

    if (marketGroup) {
      const market = marketGroup.markets?.find(
        (m: { marketId: number }) => m.marketId === marketId
      );

      if (market && typeof market.question === 'string') {
        return (
          <Link href={`/market/${marketAddress}`}>
            <span className="text-foreground hover:underline">
              {market.question}
            </span>
          </Link>
        );
      }
    }
  }

  return (
    <span className="text-muted-foreground italic">Question not available</span>
  );
};

const renderActionsCell = ({
  row,
  chainId,
}: {
  row: { original: FormattedAttestation };
  chainId?: number;
}) => {
  const viewUrl = getAttestationViewURL(chainId || 42161, row.original.id);

  // Don't render the button if no EAS explorer is configured for this chain
  if (!viewUrl) {
    return <span className="text-muted-foreground text-xs">N/A</span>;
  }

  return (
    <a href={viewUrl} target="_blank" rel="noopener noreferrer">
      <Button variant="outline" size="xs">
        View
      </Button>
    </a>
  );
};

const ForecastsTable = ({
  attestations,
  parentMarketAddress,
  parentChainId,
  parentMarketId,
}: PredictionPositionsTableProps) => {
  const { marketGroups, isMarketsLoading } = useSapience();

  const isMarketPage = parentMarketAddress && parentChainId && parentMarketId;

  // Memoize the calculation for showing the question column
  const shouldDisplayQuestionColumn = React.useMemo(() => {
    // Early returns for simple conditions
    if (isMarketPage) return false;
    if (!attestations || attestations.length === 0) return false;
    if (!marketGroups || marketGroups.length === 0) return false;

    // Check if any attestation has a market with multiple markets
    return attestations.some((attestation) => {
      const marketAddress = getMarketAddressForAttestation(
        attestation,
        parentMarketAddress,
        marketGroups
      );

      if (!marketAddress) return false;

      return hasMultipleMarkets(marketAddress, marketGroups);
    });
  }, [isMarketPage, attestations, marketGroups, parentMarketAddress]);

  const columns: ColumnDef<FormattedAttestation>[] = React.useMemo(
    () => [
      {
        accessorKey: 'question',
        header: 'Question',
        cell: (info) =>
          renderQuestionCell({
            row: info.row,
            marketGroups,
            isMarketsLoading,
            parentMarketAddress,
          }),
      },
      {
        accessorKey: 'value',
        header: 'Prediction',
        cell: (info) =>
          renderPredictionCell({
            row: info.row,
            marketGroups,
            isMarketsLoading,
            parentMarketAddress,
          }),
      },
      {
        accessorKey: 'comment',
        header: 'Comment',
        cell: (info) =>
          info.row.original.comment || (
            <span className="text-muted-foreground italic">No comment</span>
          ),
      },
      {
        accessorKey: 'rawTime',
        header: 'Submitted',
        cell: (info) => renderSubmittedCell({ row: info.row }),
      },
      {
        id: 'actions',
        cell: (info) =>
          renderActionsCell({ row: info.row, chainId: parentChainId }),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [marketGroups, isMarketsLoading, isMarketPage, shouldDisplayQuestionColumn]
  );

  const table = useReactTable({
    data: attestations || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  // Add check to return null if no attestations
  if (!attestations || attestations.length === 0) {
    return null;
  }

  const renderContent = (
    content: unknown
  ): React.ReactNode | string | number | null => {
    if (typeof content === 'bigint') {
      return content.toString();
    }
    if (Array.isArray(content)) {
      return (
        <>
          {content.map((item, index) => (
            <React.Fragment key={index}>{renderContent(item)}</React.Fragment>
          ))}
        </>
      );
    }
    if (React.isValidElement(content)) {
      return content;
    }
    return content as string | number | null;
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const content = header.isPlaceholder
                  ? null
                  : flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    );
                return (
                  <TableHead key={header.id} colSpan={header.colSpan}>
                    {renderContent(content)}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && 'selected'}
              >
                {row.getVisibleCells().map((cell) => {
                  const content = flexRender(
                    cell.column.columnDef.cell,
                    cell.getContext()
                  );
                  return (
                    <TableCell key={cell.id}>
                      {renderContent(content)}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default ForecastsTable;
