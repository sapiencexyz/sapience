'use client';

import { gql } from '@apollo/client';
import { Button } from '@foil/ui/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@foil/ui/components/ui/table';
import { useToast } from '@foil/ui/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { blo } from 'blo';
import { print } from 'graphql';
import { Copy } from 'lucide-react';
import { useParams } from 'next/navigation';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

import LottieLoader from '~/components/LottieLoader';
import NumberDisplay from '~/components/numberDisplay';
import { foilApi } from '~/lib/utils/util';

// Create a public client for ENS resolution
const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

// Hook to fetch ENS name
const useEnsName = (address: string) => {
  return useQuery({
    queryKey: ['ensName', address],
    queryFn: async () => {
      try {
        if (!address) return null;
        return await publicClient.getEnsName({
          address: address as `0x${string}`,
        });
      } catch (error) {
        console.error('Error fetching ENS name:', error);
        return null;
      }
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });
};

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
      market {
        id
        marketId
        startTimestamp
        endTimestamp
        settled
        settlementPriceD18
        question
        marketGroup {
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
  const { toast } = useToast();
  const { data: ensName } = useEnsName(address);

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

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address);
    toast({
      title: 'Copied to clipboard',
      description: 'Address copied successfully',
      duration: 2000,
    });
  };

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

  const truncatedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
  const displayName = ensName || truncatedAddress;

  return (
    <div className="container max-w-6xl mx-auto py-32 px-4">
      <div className="mb-8 flex flex-row items-center gap-4">
        <img
          alt={address}
          src={blo(address as `0x${string}`)}
          className="w-16 h-16 rounded-md"
        />
        <div>
          <p className="text-muted-foreground block mb-1">
            Ethereum Account Address
          </p>
          <div className="flex items-center gap-2">
            <p className="font-mono text-2xl">{displayName}</p>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleCopy}
            >
              <Copy className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </Button>
          </div>
        </div>
      </div>

      {!positions || positions.length === 0 ? (
        <div className="flex h-96 w-full flex-col items-center justify-center gap-4">
          <p className="text-muted-foreground">
            No positions found for this address
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Question</TableHead>
                <TableHead>Prediction</TableHead>
                <TableHead>Wager</TableHead>
                <TableHead>Profit/Loss</TableHead>
                <TableHead>Potential Profit</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions?.map((position: any) => (
                <TableRow key={position.id}>
                  <TableCell>
                    {position.epoch.question || 'No question provided'}
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
                  <TableCell>
                    <NumberDisplay
                      value={Number(position.collateral) / 10 ** 18}
                    />{' '}
                    wstETH
                  </TableCell>
                  <TableCell>
                    {/* Actual or realized profit/loss */}
                    {position.isSettled ? '+' : ''}
                    <NumberDisplay value={0} /> wstETH
                  </TableCell>
                  <TableCell>
                    {/* Potential profit calculation */}
                    <NumberDisplay
                      value={(Number(position.collateral) / 10 ** 18) * 0.2}
                    />{' '}
                    wstETH
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant={position.isSettled ? 'default' : 'secondary'}
                    >
                      {position.isSettled ? 'Claim' : 'Sell'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
