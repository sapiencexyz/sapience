import PercentChance from '~/components/shared/PercentChance';

// Displays the API-provided estimated YES probability for a condition, or a
// muted dash when none exists (e.g. Pyth/UMA conditions without an estimate).
// PercentChance requires a number — colorByProbability would clamp null to 0
// and paint it red — so the guard lives here.
export default function EstimatedPrice({
  estimatedPrice,
  className,
}: {
  estimatedPrice?: number | null;
  className?: string;
}) {
  if (estimatedPrice == null) {
    return <span className="text-muted-foreground font-mono">—</span>;
  }
  return (
    <PercentChance
      probability={estimatedPrice}
      showLabel
      label="chance"
      className={className ?? 'font-mono'}
      colorByProbability
    />
  );
}
