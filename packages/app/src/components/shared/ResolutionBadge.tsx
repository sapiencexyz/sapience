import { Badge } from '@sapience/ui/components/ui/badge';

/**
 * Displays "RESOLVED YES", "RESOLVED NO", or "RESOLUTION PENDING" based on condition state.
 * Returns `null` if the condition is still active (not past end time and not settled).
 */
export default function ResolutionBadge({
  settled,
  resolvedToYes,
  nonDecisive,
}: {
  settled: boolean;
  resolvedToYes?: boolean;
  nonDecisive?: boolean;
}) {
  if (!settled) {
    return (
      <Badge
        variant="outline"
        className="px-1.5 py-0.5 text-xs font-medium !rounded-md shrink-0 font-mono border-muted-foreground/30 bg-muted/20 text-muted-foreground"
      >
        RESOLUTION PENDING
      </Badge>
    );
  }

  if (nonDecisive) {
    return (
      <Badge
        variant="outline"
        className="px-1.5 py-0.5 text-xs font-medium !rounded-md shrink-0 font-mono border-muted-foreground/40 bg-muted/20 text-muted-foreground"
      >
        INDECISIVE
      </Badge>
    );
  }

  const isYes = resolvedToYes === true;
  return (
    <Badge
      variant="outline"
      className={`px-1.5 py-0.5 text-xs font-medium !rounded-md shrink-0 font-mono ${
        isYes
          ? 'border-yes/40 bg-yes/10 text-yes'
          : 'border-no/40 bg-no/10 text-no'
      }`}
    >
      RESOLVED {isYes ? 'YES' : 'NO'}
    </Badge>
  );
}
