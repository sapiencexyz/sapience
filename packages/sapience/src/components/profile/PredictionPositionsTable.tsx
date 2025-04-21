import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@foil/ui/components/ui/table';
import type { ColumnDef } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import React from 'react';
import { formatEther } from 'viem';

import type { FormattedAttestation } from '~/hooks/graphql/usePredictions';
import { useSapience } from '~/lib/context/SapienceProvider';

interface PredictionPositionsTableProps {
  attestations: FormattedAttestation[] | undefined;
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
}: {
  row: { original: FormattedAttestation };
  marketGroups: ReturnType<typeof useSapience>['marketGroups'];
  isMarketsLoading: boolean;
}) => {
  const marketAddressField = row.original.decodedData.find(
    (field) => field.name === 'marketAddress'
  );

  // Safely extract marketAddress string
  const potentialMarketAddress =
    marketAddressField &&
    typeof marketAddressField.value === 'object' &&
    marketAddressField.value !== null &&
    'value' in marketAddressField.value
      ? marketAddressField.value.value
      : null;
  const marketAddress =
    typeof potentialMarketAddress === 'string'
      ? (potentialMarketAddress as string).toLowerCase()
      : null;

  let baseTokenName = '';
  if (!isMarketsLoading && marketAddress) {
    const marketGroup = marketGroups.find(
      (group) => group.address.toLowerCase() === marketAddress
    );
    if (marketGroup) {
      baseTokenName = marketGroup.baseTokenName || '';
    }
  }

  // Conditionally render 'Yes'/'No' if baseTokenName is 'Yes'
  if (baseTokenName === 'Yes') {
    const { value } = row.original; // Assuming value is a string representation
    if (value === '1000000000000000000') {
      return 'Yes';
    }
    if (value === '0') {
      return 'No';
    }

    return formatEther(BigInt(value));
  }

  // Default: Display the pre-formatted value from the hook along with the token name
  return `${row.original.value} ${baseTokenName}`;
};

const renderQuestionCell = ({
  row,
  marketGroups,
  isMarketsLoading,
}: {
  row: { original: FormattedAttestation };
  marketGroups: ReturnType<typeof useSapience>['marketGroups'];
  isMarketsLoading: boolean;
}) => {
  const marketAddressField = row.original.decodedData.find(
    (field) => field.name === 'marketAddress'
  );

  // Safely extract marketAddress string
  const potentialMarketAddress =
    marketAddressField &&
    typeof marketAddressField.value === 'object' &&
    marketAddressField.value !== null &&
    'value' in marketAddressField.value
      ? marketAddressField.value.value
      : null;
  const marketAddress =
    typeof potentialMarketAddress === 'string'
      ? (potentialMarketAddress as string).toLowerCase()
      : null;

  const marketIdField = row.original.decodedData.find(
    (field) => field.name === 'marketId'
  );

  // Safely extract marketId hex string
  const marketIdHex =
    marketIdField &&
    typeof marketIdField.value === 'object' &&
    marketIdField.value !== null &&
    'value' in marketIdField.value &&
    typeof marketIdField.value.value === 'object' &&
    marketIdField.value.value !== null &&
    'hex' in marketIdField.value.value &&
    typeof marketIdField.value.value.hex === 'string'
      ? marketIdField.value.value.hex
      : null;

  if (isMarketsLoading) {
    return (
      <span className="text-muted-foreground italic">Loading question...</span>
    );
  }

  if (marketAddress && marketIdHex) {
    const marketId = parseInt(marketIdHex, 16); // Convert hex to number

    const marketGroup = marketGroups.find(
      (group) => group.address.toLowerCase() === marketAddress
    );

    if (marketGroup) {
      const market = marketGroup.markets.find((m) => m.marketId === marketId);

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
}: {
  row: { original: FormattedAttestation };
}) => (
  <a
    href={`https://base.easscan.org/attestation/view/${row.original.id}`}
    target="_blank"
    rel="noopener noreferrer"
    className="text-muted-foreground hover:text-foreground underline"
  >
    <ChevronRight className="h-4 w-4" />
  </a>
);

const PredictionPositionsTable: React.FC<PredictionPositionsTableProps> = ({
  attestations,
}) => {
  const { marketGroups, isMarketsLoading } = useSapience();

  const columns: ColumnDef<FormattedAttestation>[] = React.useMemo(
    () => [
      {
        accessorKey: 'rawTime',
        header: 'Submitted',
        cell: renderSubmittedCell,
      },
      {
        id: 'question',
        header: 'Question',
        cell: (props) =>
          renderQuestionCell({ ...props, marketGroups, isMarketsLoading }),
      },
      {
        accessorKey: 'value',
        header: 'Prediction',
        cell: (props) =>
          renderPredictionCell({ ...props, marketGroups, isMarketsLoading }),
      },
      {
        id: 'actions',
        header: '',
        cell: renderActionsCell,
      },
    ],
    [marketGroups, isMarketsLoading]
  );

  const table = useReactTable({
    data: attestations || [], // Use attestations directly, handle null/undefined here
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  // Add check to return null if no attestations
  if (!attestations || attestations.length === 0) {
    return null;
  }

  return (
    <div>
      <h3 className="font-medium mb-4">Predictions</h3>
      <div className="border border-muted rounded-md shadow-sm bg-background/50 overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="hover:bg-secondary/10 transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default PredictionPositionsTable;
