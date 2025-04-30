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
import React from 'react';

import { AddressDisplay } from '~/components/shared/AddressDisplay';
import LottieLoader from '~/components/shared/LottieLoader';
import type { FormattedAttestation } from '~/hooks/graphql/usePredictions';
import {
  extractMarketId,
  usePredictions,
} from '~/hooks/graphql/usePredictions'; // Import hook and necessary items
import { SCHEMA_UID } from '~/lib/constants/eas'; // Import SCHEMA_UID

interface PredictionsListProps {
  marketAddress?: string;
  optionNames?: string[];
}

// Define AddressLink component outside of the PredictionsList
const AddressLink: React.FC<{ href: string; children: React.ReactNode }> = ({
  href,
  children,
}) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="text-muted-foreground hover:text-foreground underline"
  >
    {children}
  </a>
);

// --- Cell Renderers remain here, using imported types/functions ---

const renderSubmittedCell = ({
  row,
}: {
  row: { original: FormattedAttestation };
}) => {
  const date = new Date(Number(row.original.rawTime) * 1000);
  return formatDistanceToNow(date, { addSuffix: true });
};

const renderPredictionCell = (
  { row }: { row: { original: FormattedAttestation } },
  optionNames?: string[]
) => {
  const marketId = extractMarketId(row.original.decodedData);

  // Use optionNames if available and marketId is valid
  if (optionNames && marketId !== null && marketId > 0) {
    const optionIndex = marketId - 1; // Convert from base 1 to base 0
    if (optionIndex >= 0 && optionIndex < optionNames.length) {
      return optionNames[optionIndex];
    }
  }

  // Fallback to showing the already processed value
  return row.original.value;
};

const renderAttesterCell = ({
  row,
}: {
  row: { original: FormattedAttestation };
}) => <AddressDisplay address={row.original.attester} />;

const renderActionsCell = ({
  row,
}: {
  row: { original: FormattedAttestation };
}) => (
  <AddressLink
    href={`https://base.easscan.org/attestation/view/${row.original.id}`}
  >
    <ChevronRight className="h-4 w-4" />
  </AddressLink>
);

const PredictionsList: React.FC<PredictionsListProps> = ({
  marketAddress,
  optionNames,
}) => {
  // Use the custom hook to fetch and process data
  const { data, isLoading, error } = usePredictions({
    marketAddress,
    schemaId: SCHEMA_UID, // Pass imported SCHEMA_UID to the hook
    optionNames,
  });

  // Define table columns using extracted cell renderers
  const columns: ColumnDef<FormattedAttestation>[] = React.useMemo(
    () => [
      {
        accessorKey: 'rawTime',
        header: 'Submitted',
        cell: renderSubmittedCell,
      },
      {
        accessorKey: 'value',
        header: 'Prediction',
        // Pass optionNames to the cell renderer
        cell: (props) => renderPredictionCell(props, optionNames),
      },
      {
        accessorKey: 'attester',
        header: 'Ethereum Account Address',
        cell: renderAttesterCell,
      },
      {
        id: 'actions',
        header: '',
        cell: renderActionsCell,
      },
    ],
    [optionNames] // Dependency array includes optionNames as it's used in a cell renderer
  );

  // Set up the table (data comes directly from the hook)
  const table = useReactTable({
    data: data || [], // Use data from hook, provide default empty array
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (isLoading) {
    return (
      <div className="h-full border border-muted rounded-md bg-background/50 overflow-hidden text-muted-foreground flex justify-center items-center">
        <div className="py-16">
          <LottieLoader className="h-8 w-8" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full border border-muted rounded-md bg-background/50 overflow-hidden text-muted-foreground flex justify-center items-center">
        <div className="py-16">Error loading predictions: {String(error)}</div>
      </div>
    );
  }

  return (
    <div className="h-full border border-muted rounded-md bg-background/50 overflow-hidden text-muted-foreground flex justify-center items-center">
      {data.length === 0 ? (
        <div className="py-16">
          <div className="text-center text-base my-auto">
            No predictions yet... what&apos;s yours?
          </div>
        </div>
      ) : (
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
      )}
    </div>
  );
};

export default PredictionsList;
