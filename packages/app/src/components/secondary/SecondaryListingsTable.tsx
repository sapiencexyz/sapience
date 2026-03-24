'use client';

import * as React from 'react';
import { formatEther } from 'viem';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sapience/ui/components/ui/table';
import { ChevronDown } from 'lucide-react';
import { COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';
import { useAccount } from 'wagmi';
import NumberDisplay from '~/components/shared/NumberDisplay';
import Loader from '~/components/shared/Loader';
import EmptyTabState from '~/components/shared/EmptyTabState';
import CountdownCell from '~/components/shared/CountdownCell';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import EnsAvatar from '~/components/shared/EnsAvatar';
import PicksPopover from '~/components/shared/PicksPopover';
import { useSecondaryFeed } from '~/hooks/secondary/useSecondaryFeed';
import { useEnrichedTokens } from '~/hooks/secondary/useEnrichedTokens';
import BidOnListingDialog from '~/components/secondary/BidOnListingDialog';
import AcceptBidDialog from '~/components/secondary/AcceptBidDialog';
import { useSession } from '~/lib/context/SessionContext';

interface SecondaryListingsTableProps {
  chainId: number;
}

export default function SecondaryListingsTable({
  chainId,
}: SecondaryListingsTableProps) {
  const { address } = useAccount();
  const { effectiveAddress, smartAccountAddress } = useSession();
  const { listings, isConnected, subscribeToBids } = useSecondaryFeed({
    enabled: true,
  });
  const collateralSymbol = COLLATERAL_SYMBOLS[chainId] ?? 'COLLATERAL';

  // Collect unique token addresses for enrichment
  const tokenAddresses = React.useMemo(
    () => listings.map((l) => l.token),
    [listings]
  );
  const { map: enrichedMap } = useEnrichedTokens(tokenAddresses);

  // Auto-subscribe to bids for user's own listings (track already-subscribed to avoid loops)
  const subscribedRef = React.useRef<Set<string>>(new Set());
  const isMyAddress = React.useCallback(
    (addr: string) => {
      const lower = addr.toLowerCase();
      return (
        address?.toLowerCase() === lower ||
        effectiveAddress?.toLowerCase() === lower ||
        smartAccountAddress?.toLowerCase() === lower
      );
    },
    [address, effectiveAddress, smartAccountAddress]
  );

  React.useEffect(() => {
    if (!address && !effectiveAddress) return;
    for (const listing of listings) {
      if (
        isMyAddress(listing.seller) &&
        !subscribedRef.current.has(listing.auctionId)
      ) {
        subscribedRef.current.add(listing.auctionId);
        subscribeToBids(listing.auctionId);
      }
    }
  }, [listings, address, effectiveAddress, isMyAddress, subscribeToBids]);

  if (!isConnected) {
    return <Loader />;
  }

  if (listings.length === 0) {
    return <EmptyTabState message="NO ACTIVE LISTINGS" />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:!bg-white/[0.03] bg-white/[0.03] border-b border-border/60">
          <TableHead className="h-auto py-3">Position</TableHead>
          <TableHead className="h-auto py-3">Amount</TableHead>
          <TableHead className="h-auto py-3">Seller</TableHead>
          <TableHead className="h-auto py-3">Expires</TableHead>
          <TableHead className="h-auto py-3 text-right"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {listings.map((listing) => {
          let amount: number;
          try {
            amount = parseFloat(formatEther(BigInt(listing.tokenAmount)));
          } catch {
            return null; // Skip malformed listings
          }
          const isMine = isMyAddress(listing.seller);
          const enriched = enrichedMap.get(listing.token.toLowerCase());

          return (
            <TableRow key={listing.auctionId}>
              <TableCell>
                <PicksPopover
                  picks={enriched?.picks ?? []}
                  fallbackAddress={listing.token}
                />
              </TableCell>
              <TableCell>
                <span className="font-mono text-brand-white">
                  <NumberDisplay value={amount} />
                </span>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2 text-brand-white">
                  <EnsAvatar address={listing.seller} width={20} height={20} />
                  <AddressDisplay address={listing.seller} />
                </div>
              </TableCell>
              <TableCell>
                <CountdownCell endTime={listing.sellerDeadline} />
              </TableCell>
              <TableCell className="text-right">
                {isMine ? (
                  <AcceptBidDialog
                    listing={listing}
                    collateralSymbol={collateralSymbol}
                  >
                    <button
                      type="button"
                      className="inline-flex items-center justify-center h-6 px-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground text-[10px] flex-shrink-0 text-brand-white transition-colors duration-300 ease-out"
                    >
                      <span className="font-mono">
                        {listing.bidCount === 1
                          ? '1 BID'
                          : `${listing.bidCount} BIDS`}
                      </span>
                      <ChevronDown className="ml-1 h-3.5 w-3.5 transition-transform duration-300 ease-out" />
                    </button>
                  </AcceptBidDialog>
                ) : (
                  <BidOnListingDialog
                    listing={listing}
                    collateralSymbol={collateralSymbol}
                  >
                    <button
                      type="button"
                      className="inline-flex items-center justify-center h-6 px-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground text-[10px] flex-shrink-0 text-brand-white transition-colors duration-300 ease-out font-mono"
                    >
                      PLACE BID
                    </button>
                  </BidOnListingDialog>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
