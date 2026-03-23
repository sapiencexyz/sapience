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
import { Badge } from '@sapience/ui/components/ui/badge';
import { Button } from '@sapience/ui/components/ui/button';
import { formatDistanceToNowStrict } from 'date-fns';
import { Clock, ShoppingCart, Gavel } from 'lucide-react';
import NumberDisplay from '~/components/shared/NumberDisplay';
import Loader from '~/components/shared/Loader';
import EmptyTabState from '~/components/shared/EmptyTabState';
import { useSecondaryFeed } from '~/hooks/secondary/useSecondaryFeed';
import BidOnListingDialog from '~/components/secondary/BidOnListingDialog';
import AcceptBidDialog from '~/components/secondary/AcceptBidDialog';
import { COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';
import { useAccount } from 'wagmi';
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
    return (
      <EmptyTabState message="No active secondary market listings. Sell a position to get started!" />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Token</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Seller</TableHead>
          <TableHead>Bids</TableHead>
          <TableHead>Expires</TableHead>
          <TableHead className="text-right">Action</TableHead>
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
          const deadline = new Date(listing.sellerDeadline * 1000);
          const isExpired = deadline < new Date();
          const isMine = isMyAddress(listing.seller);

          return (
            <TableRow
              key={listing.auctionId}
              className={isExpired ? 'opacity-50' : ''}
            >
              <TableCell className="font-mono text-xs">
                {listing.token.slice(0, 6)}…{listing.token.slice(-4)}
              </TableCell>
              <TableCell>
                <NumberDisplay value={amount} />
              </TableCell>
              <TableCell>
                <span className="font-mono text-xs">
                  {listing.seller.slice(0, 6)}…{listing.seller.slice(-4)}
                </span>
                {isMine && (
                  <Badge variant="outline" className="ml-2 text-xs">
                    You
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <Badge variant={listing.bidCount > 0 ? 'default' : 'secondary'}>
                  {listing.bidCount}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {isExpired
                    ? 'Expired'
                    : formatDistanceToNowStrict(deadline, {
                        addSuffix: true,
                      })}
                </div>
              </TableCell>
              <TableCell className="text-right">
                {isMine ? (
                  // Seller sees their bids and can accept
                  <AcceptBidDialog
                    listing={listing}
                    collateralSymbol={collateralSymbol}
                  >
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isExpired || listing.bidCount === 0}
                    >
                      <Gavel className="w-3 h-3 mr-1" />
                      Bids ({listing.bidCount})
                    </Button>
                  </AcceptBidDialog>
                ) : (
                  // Buyer can place a bid
                  <BidOnListingDialog
                    listing={listing}
                    collateralSymbol={collateralSymbol}
                  >
                    <Button size="sm" disabled={isExpired}>
                      <ShoppingCart className="w-3 h-3 mr-1" />
                      Buy
                    </Button>
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
