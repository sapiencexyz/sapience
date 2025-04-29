import { format } from 'date-fns';

interface MarketTimingProps {
  startTimestamp: number;
  endTimestamp: number;
  showDuration?: boolean;
}

const MarketTiming = ({
  startTimestamp,
  endTimestamp,
  showDuration = true,
}: MarketTimingProps) => {
  const now = Math.floor(Date.now() / 1000);
  const isStartInFuture = startTimestamp > now;
  const date = isStartInFuture ? startTimestamp : endTimestamp;
  const prefix = isStartInFuture ? 'Starts' : 'Ends';

  const weeks = Math.round((endTimestamp - startTimestamp) / (7 * 24 * 3600));

  return (
    <span className="whitespace-nowrap">
      {prefix} {format(new Date(date * 1000), 'M/d')}
      {showDuration && (
        <span className="text-xs text-muted-foreground ml-1">
          {weeks} week period
        </span>
      )}
    </span>
  );
};

export default MarketTiming;
