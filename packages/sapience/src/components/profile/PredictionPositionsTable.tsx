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

const PredictionPositionsTable = ({
  attestations,
  parentMarketAddress,
  parentChainId,
  parentMarketId,
}: PredictionPositionsTableProps) => {
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
        accessorKey: 'question',
        header: 'Question',
        cell: (info) =>
          renderQuestionCell({ row: info.row, marketGroups, isMarketsLoading }),
      },
      {
        accessorKey: 'value',
        header: 'Prediction',
        cell: (info) =>
          renderPredictionCell({
            row: info.row,
            marketGroups,
            isMarketsLoading,
          }),
      },
      {
        accessorKey: 'rawTime',
        header: 'Submitted',
        cell: (info) => renderSubmittedCell({ row: info.row }),
      },
      {
        id: 'actions',
        cell: (info) => renderActionsCell({ row: info.row }),
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

export default PredictionPositionsTable;
