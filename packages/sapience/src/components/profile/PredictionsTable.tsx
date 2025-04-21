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

import type { FormattedAttestation } from '~/hooks/graphql/usePredictions';

interface PredictionsTableProps {
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
}: {
  row: { original: FormattedAttestation };
}) => {
  // Display the pre-formatted value from the hook
  return row.original.value;
};

const renderQuestionCell = ({
  row,
}: {
  row: { original: FormattedAttestation };
}) => {
  // Attempt to find the marketAddress in the decoded data
  const marketAddressField = row.original.decodedData.find(
    (field) => field.name === 'marketAddress'
  );

  if (marketAddressField && typeof marketAddressField.value === 'string') {
    const marketAddress = marketAddressField.value;
    // Link to the specific market page
    return (
      <Link href={`/market/${marketAddress}`}>
        <span className="text-muted-foreground hover:text-foreground underline flex items-center">
          View Question <ChevronRight className="h-4 w-4 ml-1" />
        </span>
      </Link>
    );
  }

  // Fallback if marketAddress is not found or not a string
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

const PredictionsTable: React.FC<PredictionsTableProps> = ({
  attestations,
  // Remove isLoading and error from destructuring
  // isLoading,
  // error,
}) => {
  // Move hooks before the early return
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
        cell: renderQuestionCell,
      },
      {
        accessorKey: 'value',
        header: 'Prediction',
        cell: renderPredictionCell,
      },
      {
        id: 'actions',
        header: '',
        cell: renderActionsCell,
      },
    ],
    [] // Dependencies - add optionNames if used in renderPredictionCell
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

  // Data is guaranteed to be non-empty array here
  // Remove the redundant 'data' variable assignment
  // const data = attestations;

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

export default PredictionsTable;
