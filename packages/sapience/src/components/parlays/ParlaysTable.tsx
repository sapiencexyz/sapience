import { useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sapience/ui/components/ui/table';
import { Badge } from '@sapience/ui/components/ui/badge';
import { Button } from '@sapience/ui/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import type { ParlayData } from '~/hooks/useParlays';
import { useFillParlayOrder } from '~/hooks/forms/useFillParlayOrder';

type Props = {
  parlays: Array<
    ParlayData & { collateralFormatted: string; payoutFormatted: string }
  >;
  loading?: boolean;
  error?: string | null;
};

export function ParlaysTable({ parlays, loading, error }: Props) {
  const rows = useMemo(() => parlays, [parlays]);

  if (error) {
    return (
      <div className="text-destructive">Failed to load parlays: {error}</div>
    );
  }

  return (
    <div className="w-full">
      <Table>
        <TableCaption>
          {loading ? 'Loading parlays…' : `${rows.length} parlay(s) found`}
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Maker</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead>Collateral</TableHead>
            <TableHead>Payout</TableHead>
            <TableHead>Markets</TableHead>
            <TableHead>Outcome</TableHead>
            <TableHead>Fill Amount</TableHead>
            <TableHead>Total Payout</TableHead>
            <TableHead>Settles</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => {
            const created = new Date(Number(p.createdAt) * 1000);
            const expires = new Date(Number(p.orderExpirationTime) * 1000);
            const status = p.settled ? 'Settled' : p.filled ? 'Filled' : 'Open';
            const statusVariant = p.settled
              ? 'secondary'
              : p.filled
                ? 'default'
                : 'outline';
            const isExpired =
              Date.now() >= Number(p.orderExpirationTime) * 1000;
            const canFill = !p.filled && !p.settled && !isExpired;

            const { fillParlay, isFilling } = useFillParlayOrder({
              requestId: p.id,
              payout: p.payout,
              collateral: p.collateral,
              enabled: canFill,
            });
            const fillAmount = useMemo(() => {
              const payoutNum = Number(p.payoutFormatted);
              const collateralNum = Number(p.collateralFormatted);
              const diff = payoutNum - collateralNum;
              if (!isFinite(diff) || diff <= 0) return '0';
              return String(diff);
            }, [p.payoutFormatted, p.collateralFormatted]);
            return (
              <TableRow key={String(p.id)}>
                <TableCell className="font-mono">{String(p.id)}</TableCell>
                <TableCell className="font-mono truncate max-w-[140px]">
                  {p.maker}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant as any}>{status}</Badge>
                </TableCell>
                <TableCell title={created.toISOString()}>
                  {formatDistanceToNow(created, { addSuffix: true })}
                </TableCell>
                <TableCell title={expires.toISOString()}>
                  {formatDistanceToNow(expires, { addSuffix: true })}
                </TableCell>
                <TableCell>{p.collateralFormatted}</TableCell>
                <TableCell>{p.payoutFormatted}</TableCell>
                <TableCell>{p.predictedOutcomes.length}</TableCell>
                <TableCell>
                  {p.settled ? (
                    p.makerWon ? (
                      <Badge variant="default">Maker Won</Badge>
                    ) : (
                      <Badge variant="destructive">Maker Lost</Badge>
                    )
                  ) : (
                    <span className="text-muted-foreground">Pending</span>
                  )}
                </TableCell>
                <TableCell>{fillAmount}</TableCell>
                <TableCell>{p.payoutFormatted}</TableCell>
                <TableCell>
                  <span className="text-muted-foreground">—</span>
                </TableCell>
                <TableCell>
                  {canFill ? (
                    <Button size="sm" onClick={fillParlay} disabled={isFilling}>
                      {isFilling ? 'Filling…' : 'Fill'}
                    </Button>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default ParlaysTable;
