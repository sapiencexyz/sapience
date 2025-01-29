import { format } from 'date-fns';

interface EpochTimingProps {
  startTimestamp: number;
  endTimestamp: number;
  showDuration?: boolean;
}

const EpochTiming = ({
  startTimestamp,
  endTimestamp,
  showDuration = true,
}: EpochTimingProps) => {
  const now = Math.floor(Date.now() / 1000);
  const isStartInFuture = startTimestamp > now;
  const date = isStartInFuture ? startTimestamp : endTimestamp;
  const prefix = isStartInFuture ? 'Starts' : 'Ends';

  const weeks = Math.round((endTimestamp - startTimestamp) / (7 * 24 * 3600));

  return (
    <span className="whitespace-nowrap">
      {prefix} {format(new Date(date * 1000), 'M/d')}
      {showDuration && (
        <span className="text-xs text-muted-foreground ml-2">
          {weeks} week period
        </span>
      )}
    </span>
  );
};

export default EpochTiming;
