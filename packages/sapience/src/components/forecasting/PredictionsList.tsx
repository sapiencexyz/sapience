import { gql } from '@apollo/client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@foil/ui/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { print } from 'graphql';
import { ChevronRight } from 'lucide-react';
import React from 'react';
import { getAddress } from 'viem';

import { AddressDisplay } from '~/components/shared/AddressDisplay';
import LottieLoader from '~/components/shared/LottieLoader';

interface PredictionsListProps {
  marketAddress?: string;
  schemaId?: string;
  optionNames?: string[];
}

// Type for the raw data fetched from the API
interface RawAttestation {
  id: string;
  decodedDataJson: string;
  attester: string;
  recipient: string;
  time: number; // API returns time as a number (Unix timestamp)
}

// Parameterized version of the query
const PARAMETERIZED_QUERY = gql`
  query FindAttestationByMarketAddressWithFilters(
    $schemaId: String!
    $marketAddress: String!
    $take: Int!
  ) {
    attestations(
      where: {
        schemaId: { equals: $schemaId }
        decodedDataJson: { contains: $marketAddress }
      }
      orderBy: { time: desc }
      take: $take
    ) {
      id
      decodedDataJson
      attester
      recipient
      time
    }
  }
`;

interface DecodedField {
  name: string;
  value:
    | {
        value?: {
          hex?: string;
        };
      }
    | string
    | number;
}

// Define the data type for the formatted attestation record used in the table
type FormattedAttestation = {
  id: string;
  attester: string;
  shortAttester: string;
  value: string;
  time: string; // Formatted time string
  rawTime: number; // Original timestamp
  decodedData: DecodedField[];
};

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

// Helper function to parse the JSON string in decodedDataJson
const parseDecodedData = (decodedDataJson: string): DecodedField[] => {
  try {
    return JSON.parse(decodedDataJson);
  } catch (e) {
    console.error('Failed to parse decodedDataJson:', e);
    return [];
  }
};

// Helper function to extract market ID from decoded data
const extractMarketId = (decodedData: DecodedField[]): number | null => {
  const marketIdField = decodedData.find((field) => field.name === 'marketId');

  if (marketIdField?.value) {
    if (typeof marketIdField.value === 'number') {
      return marketIdField.value;
    }
    if (
      typeof marketIdField.value === 'object' &&
      marketIdField.value.value?.hex
    ) {
      try {
        return parseInt(marketIdField.value.value.hex, 16);
      } catch (e) {
        console.error('Failed to parse marketId hex:', e);
      }
    } else if (typeof marketIdField.value === 'string') {
      try {
        return parseInt(marketIdField.value, 10);
      } catch (e) {
        console.error('Failed to parse marketId string:', e);
      }
    }
  }
  return null;
};

// Helper function to extract prediction value based on sqrtPriceX96
const extractSqrtPricePrediction = (predictionField: DecodedField): string => {
  if (
    typeof predictionField.value === 'object' &&
    predictionField.value.value?.hex
  ) {
    const { hex } = predictionField.value.value;
    try {
      const sqrtPriceX96 = BigInt(hex);
      const price = Number(
        (sqrtPriceX96 * sqrtPriceX96) /
          BigInt(
            '6277101735386680763835789423207666416102355444464034512896' // 2^192
          )
      );

      if (price === 0) return '0';
      if (price % 1 === 0) return price.toString();
      return Number.parseFloat(price.toFixed(4)).toString();
    } catch (e) {
      console.error('Failed to parse hex value:', e);
      return hex; // Fallback to showing the hex
    }
  } else if (
    typeof predictionField.value === 'object' &&
    predictionField.value.value
  ) {
    return String(predictionField.value.value);
  }
  return 'Unknown';
};

// Helper function to determine the final prediction value string
const getPredictionDisplayValue = (
  decodedData: DecodedField[],
  optionNames?: string[]
): string => {
  const marketId = extractMarketId(decodedData);

  // Prioritize optionNames based on marketId if available
  if (marketId !== null && optionNames && optionNames[marketId - 1]) {
    // Adjust marketId (often 1-based) to 0-based index
    return optionNames[marketId - 1];
  }

  // Fallback to 'prediction' field if marketId doesn't yield a result
  const predictionField = decodedData.find(
    (field) => field.name === 'prediction'
  );
  if (predictionField) {
    return extractSqrtPricePrediction(predictionField);
  }

  return 'Unknown'; // Default fallback
};

// Format raw attestation data into a displayable format
const formatAttestationData = (
  attestation: RawAttestation,
  optionNames?: string[]
): FormattedAttestation => {
  try {
    const decodedData = parseDecodedData(attestation.decodedDataJson);
    const predictionValue = getPredictionDisplayValue(decodedData, optionNames);
    const formattedTime = new Date(
      Number(attestation.time) * 1000
    ).toLocaleString();

    return {
      id: attestation.id,
      attester: attestation.attester,
      shortAttester: `${attestation.attester.slice(0, 6)}...${attestation.attester.slice(-4)}`,
      value: predictionValue,
      time: formattedTime,
      rawTime: attestation.time,
      decodedData,
    };
  } catch (err) {
    console.error('Error processing attestation data:', err);
    return {
      id: attestation.id,
      attester: attestation.attester,
      shortAttester: `${attestation.attester.slice(0, 6)}...${attestation.attester.slice(-4)}`,
      value: 'Error processing data',
      time: new Date(Number(attestation.time) * 1000).toLocaleString(),
      rawTime: attestation.time,
      decodedData: [],
    };
  }
};

// --- Cell Renderers ---

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
  schemaId = '0x8c6ff62d30ea7aa47f0651cd5c1757d47539f8a303888c61d3f19c7502fa9a24', // Default schema ID - update this with the correct one
  optionNames,
}) => {
  const {
    data: attestationsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['attestations', marketAddress, schemaId],
    queryFn: async () => {
      if (!marketAddress) {
        return { attestations: [] };
      }

      // Normalize the market address to checksum format using viem
      let normalizedAddress;
      try {
        normalizedAddress = getAddress(marketAddress);
      } catch (e) {
        console.error('Failed to normalize market address:', e);
        normalizedAddress = marketAddress; // Fallback to the original address
      }

      console.log('Query params:', {
        marketAddress,
        normalizedAddress,
        schemaId,
      });

      // Make the request to the EAS GraphQL API
      const response = await fetch('https://base.easscan.org/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: print(PARAMETERIZED_QUERY),
          variables: {
            schemaId,
            marketAddress: normalizedAddress, // Use the normalized address
            take: 10,
          },
        }),
      });

      const result = await response.json();
      console.log('GraphQL response:', result);

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      // Check if we have data in the expected structure
      if (result.data?.attestations) {
        return result.data;
      }
      console.error('Unexpected response structure:', result);
      throw new Error('Failed to load predictions');
    },
    enabled: Boolean(marketAddress),
    retry: 3,
    retryDelay: 1000,
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

  // Transform raw attestations data into the proper format for the table
  const data: FormattedAttestation[] = React.useMemo(() => {
    if (!attestationsData?.attestations) return [];
    // Pass optionNames to formatAttestationData
    return attestationsData.attestations.map((att: RawAttestation) =>
      formatAttestationData(att, optionNames)
    );
  }, [attestationsData, optionNames]); // Added optionNames dependency

  // Set up the table
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (isLoading) {
    return (
      <>
        <h3 className="font-medium mb-4">Recent Predictions</h3>
        <div className="border border-muted rounded-md shadow-sm bg-background/50 overflow-hidden">
          <div className="py-16 text-muted-foreground flex justify-center items-center">
            <LottieLoader className="h-8 w-8" />
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <h3 className="font-medium mb-4">Recent Predictions</h3>
        <div className="border border-muted rounded-md shadow-sm bg-background/50 overflow-hidden">
          <div className="py-16 text-muted-foreground flex justify-center items-center">
            Error loading predictions: {String(error)}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <h3 className="font-medium mb-4">Recent Predictions</h3>
      <div className="border border-muted rounded-md shadow-sm bg-background/50 overflow-hidden">
        {data.length === 0 ? (
          <div className="py-16 text-muted-foreground flex justify-center items-center">
            <p className="text-center text-base">
              No predictions yet... what&apos;s yours?
            </p>
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
    </>
  );
};

export default PredictionsList;
