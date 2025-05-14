import { NumberDisplay } from '@foil/ui/components/NumberDisplay';
import { Button } from '@foil/ui/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@foil/ui/components/ui/table';
import type { ColumnDef, CellContext } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import React from 'react';

import type { FormattedAttestation } from '~/hooks/graphql/usePredictions';
import { useSapience } from '~/lib/context/SapienceProvider';

// Helper function to render prediction when baseTokenName is 'Yes'
const renderConditionalPrediction = (value: string) => {
  if (value === '1000000000000000000' || value === '1') {
    return 'Yes';
  }
  if (value === '0') {
    return 'No';
  }
  try {
    return <NumberDisplay value={BigInt(value)} />;
  } catch (e) {
    return value; // Fallback if not a BigInt string
  }
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
      (group) => group.address?.toLowerCase() === marketAddress
    );
    if (marketGroup) {
      baseTokenName = marketGroup.baseTokenName || '';
    }
  }

  const { value } = row.original; // value is a string

  // Conditionally render 'Yes'/'No' if baseTokenName is 'Yes'
  if (baseTokenName === 'Yes') {
    return renderConditionalPrediction(value);
  }

  try {
    const numericValue = BigInt(value);
    return (
      <>
        <NumberDisplay value={numericValue} />
        {baseTokenName && ` ${baseTokenName}`}
      </>
    );
  } catch (e) {
    // Fallback: if value is not a string parsable to BigInt (e.g., "CAT", "DOG" for a categorical market)
    return `${value} ${baseTokenName || ''}`.trim();
  }
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
      (group) => group.address?.toLowerCase() === marketAddress
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
  >
    <Button variant="outline" size="xs">
      View
    </Button>
  </a>
);

const PredictionPositionsTable: React.FC<PredictionPositionsTableProps> = ({
  attestations,
  parentMarketAddress,
  parentChainId,
  parentMarketId,
}) => {
  const { marketGroups, isMarketsLoading } = useSapience();

  const isMarketPage = parentMarketAddress && parentChainId && parentMarketId;

  // Memoize the calculation for showing the question column
  const shouldDisplayQuestionColumn = React.useMemo(() => {
    if (
      isMarketPage ||
      !attestations ||
      attestations.length === 0 ||
      !marketGroups ||
      marketGroups.length === 0
    ) {
      return false;
    }
    return attestations.some((attestation) => {
      const marketAddressField = attestation.decodedData.find(
        (field) => field.name === 'marketAddress'
      );
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

      if (marketAddress) {
        const marketGroup = marketGroups.find(
          (group) => group.address?.toLowerCase() === marketAddress
        );
        return (
          marketGroup &&
          marketGroup.markets &&
          Array.isArray(marketGroup.markets) &&
          marketGroup.markets.length > 1
        );
      }
      return false;
    });
  }, [isMarketPage, attestations, marketGroups]);

  const columns: ColumnDef<FormattedAttestation>[] = React.useMemo(
    () => [
      {
        accessorKey: 'rawTime',
        header: 'Submitted',
        cell: renderSubmittedCell,
      },
      ...(!isMarketPage && shouldDisplayQuestionColumn
        ? [
            {
              id: 'question',
              header: 'Question',
              cell: (
                props: CellContext<FormattedAttestation, unknown> // Type props
              ) =>
                renderQuestionCell({
                  row: props.row,
                  marketGroups,
                  isMarketsLoading,
                }), // Pass props.row
            },
          ]
        : []),
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
    [
      marketGroups,
      isMarketsLoading,
      isMarketPage,
      shouldDisplayQuestionColumn, // Use memoized value and remove attestations
    ]
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
      <div className="border border-muted rounded shadow-sm bg-background/50 overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={
                      header.id === 'question' ? '' : 'whitespace-nowrap'
                    }
                  >
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
                    <TableCell
                      key={cell.id}
                      className={`${
                        cell.column.id === 'question' ? '' : 'whitespace-nowrap'
                      } ${cell.column.id === 'actions' ? 'text-right' : ''}`}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="min-h-[69px]">
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center align-middle"
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
