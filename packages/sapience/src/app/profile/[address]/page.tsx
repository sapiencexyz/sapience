'use client';

import { gql } from '@apollo/client';
import { Badge } from '@foil/ui/components/ui/badge';
import { Button } from '@foil/ui/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@foil/ui/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';
import { useParams } from 'next/navigation';

import EpochTiming from '~/components/EpochTiming';
import LottieLoader from '~/components/LottieLoader';
import NumberDisplay from '~/components/numberDisplay';
import { foilApi } from '~/lib/utils/util';

// GraphQL query to fetch positions by owner address
const POSITIONS_QUERY = gql`
  query GetPositions($owner: String!) {
    positions(owner: $owner) {
      id
      positionId
      owner
      baseToken
      quoteToken
      collateral
      borrowedBaseToken
      borrowedQuoteToken
      isLP
      isSettled
      highPriceTick
      lowPriceTick
      lpBaseToken
      lpQuoteToken
      epoch {
        id
        epochId
        startTimestamp
        endTimestamp
        settled
        settlementPriceD18
        question
        market {
          id
          chainId
          address
          resource {
            name
            slug
          }
        }
      }
      transactions {
        id
        type
        timestamp
        transactionHash
      }
    }
  }
`;

export default function PortfolioPage() {
  const params = useParams();
  const address = (params.address as string).toLowerCase();

  const {
    data: positions,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['positions', address],
    queryFn: async () => {
      const { data, errors } = await foilApi.post('/graphql', {
        query: print(POSITIONS_QUERY),
        variables: {
          owner: address,
        },
      });

      if (errors) {
        throw new Error(errors[0].message);
      }

      return data.positions;
    },
    enabled: Boolean(address),
    staleTime: 30000, // 30 seconds
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center">
        <LottieLoader width={32} height={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-96 w-full flex-col items-center justify-center gap-4">
        <p className="text-destructive">Failed to load positions</p>
        <Button onClick={() => window.location.reload()} variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  if (!positions || positions.length === 0) {
    return (
      <div className="flex h-96 w-full flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">
          No positions found for this address
        </p>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl mx-auto py-32 px-4">
      <div className="mb-6 flex flex-col">
        <p className="text-muted-foreground block mb-2">
          Ethereum Account Address
        </p>
        <p className="font-mono text-2xl">{address}</p>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Position</TableHead>
              <TableHead>Question</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Collateral</TableHead>
              <TableHead>Size</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions?.map((position: any) => (
              <TableRow key={position.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span>#{position.positionId}</span>
                    <Badge variant={position.isLP ? 'secondary' : 'default'}>
                      {position.isLP ? 'LP' : 'Trader'}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell>
                  {position.epoch.question || 'No question provided'}
                </TableCell>
                <TableCell>
                  <EpochTiming
                    startTimestamp={position.epoch.startTimestamp}
                    endTimestamp={position.epoch.endTimestamp}
                  />
                </TableCell>
                <TableCell>
                  <NumberDisplay
                    value={Number(position.collateral) / 10 ** 18}
                  />{' '}
                  wstETH
                </TableCell>
                <TableCell>
                  {position.isLP ? (
                    <span>
                      <NumberDisplay
                        value={
                          (position.lpBaseToken
                            ? Number(position.lpBaseToken)
                            : Number(position.baseToken) -
                              Number(position.borrowedBaseToken || 0)) /
                          10 ** 18
                        }
                      />{' '}
                      Ggas
                    </span>
                  ) : (
                    <span>
                      <NumberDisplay
                        value={
                          (Number(position.baseToken) -
                            Number(position.borrowedBaseToken || 0)) /
                          10 ** 18
                        }
                      />{' '}
                      Ggas
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
