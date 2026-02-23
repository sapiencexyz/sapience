'use client';

import type { Address } from 'viem';
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
import * as React from 'react';
import EmptyTabState from '~/components/shared/EmptyTabState';
import NumberDisplay from '~/components/shared/NumberDisplay';
import Loader from '~/components/shared/Loader';
import { COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';
import {
  useV2Predictions,
  type V2Prediction,
} from '~/hooks/graphql/useV2Positions';

// Settlement result display
const SETTLEMENT_RESULT_LABELS: Record<
  string,
  {
    label: string;
    variant: 'default' | 'success' | 'destructive' | 'secondary';
  }
> = {
  UNRESOLVED: { label: 'Pending', variant: 'secondary' },
  PREDICTOR_WINS: { label: 'Predictor Wins', variant: 'success' },
  COUNTERPARTY_WINS: { label: 'Counterparty Wins', variant: 'success' },
  NON_DECISIVE: { label: 'Non-Decisive', variant: 'default' },
};

function SettlementBadge({ result }: { result: string }) {
  const config =
    SETTLEMENT_RESULT_LABELS[result] || SETTLEMENT_RESULT_LABELS.UNRESOLVED;
  return <Badge variant={config.variant as any}>{config.label}</Badge>;
}

function V2PredictionRow({
  prediction,
  userAddress,
  collateralSymbol,
}: {
  prediction: V2Prediction;
  userAddress: string;
  collateralSymbol: string;
}) {
  const isPredictor =
    prediction.predictor.toLowerCase() === userAddress.toLowerCase();
  const userCollateral = isPredictor
    ? prediction.predictorCollateral
    : prediction.counterpartyCollateral;
  const totalPool =
    BigInt(prediction.predictorCollateral) + BigInt(prediction.counterpartyCollateral);

  const collateralFormatted = parseFloat(formatEther(BigInt(userCollateral)));
  const totalPoolFormatted = parseFloat(formatEther(totalPool));

  // Determine claimable amount if settled
  let claimableFormatted = 0;
  if (prediction.settled) {
    const claimable = isPredictor
      ? prediction.predictorClaimable
      : prediction.counterpartyClaimable;
    if (claimable) {
      claimableFormatted = parseFloat(formatEther(BigInt(claimable)));
    }
  }

  return (
    <TableRow>
      <TableCell>
        <code className="text-xs text-muted-foreground">
          {prediction.predictionId.slice(0, 10)}...
        </code>
      </TableCell>
      <TableCell>
        <Badge variant={isPredictor ? 'default' : 'secondary'}>
          {isPredictor ? 'Predictor' : 'Counterparty'}
        </Badge>
      </TableCell>
      <TableCell>
        <NumberDisplay value={collateralFormatted} appendedText={collateralSymbol} />
      </TableCell>
      <TableCell>
        <NumberDisplay
          value={totalPoolFormatted}
          appendedText={collateralSymbol}
        />
      </TableCell>
      <TableCell>
        <SettlementBadge result={prediction.result} />
      </TableCell>
      <TableCell>
        {prediction.settled && claimableFormatted > 0 ? (
          <NumberDisplay
            value={claimableFormatted}
            appendedText={collateralSymbol}
          />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}

export default function V2PositionsTable({
  account,
  showHeaderText = true,
  chainId,
  leftSlot,
}: {
  account: Address;
  showHeaderText?: boolean;
  chainId?: number;
  leftSlot?: React.ReactNode;
}) {
  const collateralSymbol = COLLATERAL_SYMBOLS[chainId || 5064014] || 'USDe';

  // Fetch V2 predictions for this user
  const {
    data: predictions,
    isLoading,
    error,
  } = useV2Predictions({
    address: account,
    chainId,
  });

  // Header with leftSlot (tab switcher) and optional title
  const headerContent = (
    <div className="px-4 py-4 border-b border-border flex items-center gap-4">
      {leftSlot}
      <div className="flex-1">
        {showHeaderText && (
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">V2 Positions</h3>
            <Badge variant="outline">{predictions.length} positions</Badge>
          </div>
        )}
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <>
        {headerContent}
        <div className="flex items-center justify-center py-8">
          <Loader />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        {headerContent}
        <div className="text-destructive text-center py-8">
          Error loading V2 positions
        </div>
      </>
    );
  }

  if (predictions.length === 0) {
    return (
      <>
        {headerContent}
        <EmptyTabState message="No V2 positions found" />
      </>
    );
  }

  return (
    <>
      {headerContent}
      <div className="rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Prediction ID</TableHead>
              <TableHead>Side</TableHead>
              <TableHead>Your Collateral</TableHead>
              <TableHead>Total Pool</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Claimable</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {predictions.map((prediction) => (
              <V2PredictionRow
                key={prediction.predictionId}
                prediction={prediction}
                userAddress={account}
                collateralSymbol={collateralSymbol}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
